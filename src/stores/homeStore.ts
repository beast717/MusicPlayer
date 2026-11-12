import { create } from 'zustand';
import { Track } from '../types';
import { getRadioTracks } from '../services/youtubeMusic';
import {
  Mix,
  BecauseYouListened,
  pickSeeds,
  pickRecentSeed,
  buildQuickPicks,
  buildMix,
  buildBecauseYouListened,
  createTaste,
} from '../services/recommendations';
import { useHistoryStore } from './historyStore';
import { useLibraryStore } from './libraryStore';
import { usePlayerStore } from './playerStore';

const MAX_SEEDS = 5;
const QUICK_PICK_SEEDS = 4;
const STALE_AFTER_MS = 30 * 60 * 1000;

interface HomeState {
  quickPicks: Track[];
  mixes: Mix[];
  becauseYouListened: BecauseYouListened | null;
  isLoading: boolean;
  /** Recommendations were requested but none could be loaded (e.g. offline). */
  loadFailed: boolean;
  lastUpdated: number | null;
}

interface HomeActions {
  /** Rebuild the recommendations. `force` re-fetches radios instead of using the cache. */
  refresh: (options?: { force?: boolean }) => Promise<void>;
  refreshIfStale: () => Promise<void>;
  getMix: (id: string) => Mix | undefined;
  /** Take a track out of everything on screen (it was marked "not interested"). */
  removeTrack: (trackId: string) => void;
}

type HomeStore = HomeState & HomeActions;

// Latest-wins: an older refresh must not overwrite a newer one
let _refreshCounter = 0;

export const useHomeStore = create<HomeStore>()((set, get) => ({
  quickPicks: [],
  mixes: [],
  becauseYouListened: null,
  isLoading: false,
  loadFailed: false,
  lastUpdated: null,

  refresh: async ({ force = false } = {}) => {
    const myRefresh = ++_refreshCounter;
    const now = Date.now();
    const { stats, notInterested } = useHistoryStore.getState();
    const favorites = useLibraryStore.getState().favorites;
    const taste = createTaste(stats, favorites, notInterested);
    const fallback = [...usePlayerStore.getState().recentlyPlayed, ...favorites];

    const seeds = pickSeeds(taste, fallback, now, MAX_SEEDS);
    if (seeds.length === 0) {
      // Nothing listened to yet: there is nothing to recommend from
      set({
        quickPicks: [],
        mixes: [],
        becauseYouListened: null,
        isLoading: false,
        loadFailed: false,
        // Stay "stale" so recommendations appear as soon as there is history
        lastUpdated: null,
      });
      return;
    }

    const recentSeed = pickRecentSeed(taste, seeds);
    set({ isLoading: true });

    // A radio that fails to load just leaves its section out
    const loadRadio = (track: Track) =>
      getRadioTracks(track.id, { forceRefresh: force }).catch(() => null);
    const [seedRadios, recentRadio] = await Promise.all([
      Promise.all(seeds.map(loadRadio)),
      recentSeed ? loadRadio(recentSeed) : Promise.resolve(null),
    ]);
    if (myRefresh !== _refreshCounter) return;

    const loaded = seeds
      .map((seed, i) => ({ seed, radio: seedRadios[i] }))
      .filter((entry): entry is { seed: Track; radio: Track[] } => entry.radio != null);

    if (loaded.length === 0 && !recentRadio) {
      // Keep whatever is already on screen
      set({ isLoading: false, loadFailed: true });
      return;
    }

    const quickPickSources = loaded.slice(0, QUICK_PICK_SEEDS);
    set({
      quickPicks: buildQuickPicks(
        quickPickSources.map((e) => e.seed),
        quickPickSources.map((e) => e.radio),
        taste
      ),
      mixes: loaded.map((e) => buildMix(e.seed, e.radio, taste)),
      becauseYouListened:
        recentSeed && recentRadio
          ? buildBecauseYouListened(recentSeed, recentRadio, taste)
          : null,
      isLoading: false,
      loadFailed: false,
      lastUpdated: now,
    });
  },

  refreshIfStale: async () => {
    const { lastUpdated, isLoading, loadFailed } = get();
    if (isLoading) return;
    if (lastUpdated == null || loadFailed || Date.now() - lastUpdated > STALE_AFTER_MS) {
      await get().refresh();
    }
  },

  getMix: (id) => get().mixes.find((m) => m.id === id),

  removeTrack: (trackId) => {
    const keep = (t: Track) => t.id !== trackId;
    set((state) => ({
      quickPicks: state.quickPicks.filter(keep),
      mixes: state.mixes
        // A mix is built around its first track; without it the mix is gone
        .filter((mix) => mix.tracks[0]?.id !== trackId)
        .map((mix) => ({ ...mix, tracks: mix.tracks.filter(keep) })),
      becauseYouListened:
        state.becauseYouListened && state.becauseYouListened.seed.id !== trackId
          ? {
              ...state.becauseYouListened,
              tracks: state.becauseYouListened.tracks.filter(keep),
            }
          : null,
    }));
  },
}));
