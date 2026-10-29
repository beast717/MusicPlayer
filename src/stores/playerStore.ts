import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import TrackPlayer, { AddTrack, RepeatMode } from 'react-native-track-player';
import { Track } from '../types';
import { zustandMMKVStorage } from '../services/storage';
import { withCurrentLocalPaths } from '../services/downloadManager';
import {
  getLocalTrackSource,
  prefetchStreams,
  resolveTrackSource,
  toTrackPlayerTrack,
  PLACEHOLDER_URL,
  PlayerTrackSource,
} from '../services/trackPlayerHelpers';
import { MAX_RECENT_TRACKS } from '../utils/constants';
import { shuffleArray } from '../utils/helpers';

// ─── Concurrency helpers ────────────────────────────────────────────
// Latest-wins pattern: each playTrack/playQueue call gets a unique nonce.
// If a newer call starts while an older one is still resolving, the older
// one bails out at the next async boundary. No waiting/blocking.
let _switchNonce = 0;

// When non-null, playTrack/playQueue is actively managing this track.
// The PlaybackActiveTrackChanged handler must NOT overwrite currentTrack
// while this is set.
let _switchingTrackId: string | null = null;

// True while toggleShuffle is rearranging the TrackPlayer queue around the
// playing track. Active-track events during that window are not real skips.
let _isReorderingQueue = false;

// True while the playback service swaps a placeholder for its resolved
// stream (remove + add + skip). The queue must not be rearranged meanwhile.
let _isSwappingTrack = false;

export function setSwappingTrack(value: boolean): void {
  _isSwappingTrack = value;
}

export function isSwappingTrack(): boolean {
  return _isSwappingTrack;
}

export function getSwitchingTrackId(): string | null {
  return _switchingTrackId;
}

export function isReorderingQueue(): boolean {
  return _isReorderingQueue;
}

/** The next `count` tracks after the playing one, in play order (wrapping when repeating the queue). */
export async function getUpcomingTracks(count: number): Promise<Track[]> {
  const { queue, repeatMode } = usePlayerStore.getState();
  const activeIndex = await TrackPlayer.getActiveTrackIndex();
  if (activeIndex == null || queue.length < 2) return [];

  const upcoming: Track[] = [];
  for (let step = 1; step <= count && step < queue.length; step++) {
    const index = activeIndex + step;
    if (index >= queue.length && repeatMode !== 'queue') break;
    upcoming.push(queue[index % queue.length]);
  }
  return upcoming;
}


export type ShuffleMode = 'off' | 'on';
export type RepeatModeType = 'off' | 'track' | 'queue';

export function toTrackPlayerRepeatMode(mode: RepeatModeType): RepeatMode {
  switch (mode) {
    case 'queue':
      return RepeatMode.Queue;
    case 'track':
      return RepeatMode.Track;
    default:
      return RepeatMode.Off;
  }
}

interface PlayerState {
  currentTrack: Track | null;
  /** Tracks in play order (shuffled when shuffle is on). Mirrors the TrackPlayer queue. */
  queue: Track[];
  /** The queue in the order it was started, used to restore order when shuffle is turned off. */
  originalQueue: Track[];
  recentlyPlayed: Track[];
  isPlaying: boolean;
  shuffleMode: ShuffleMode;
  repeatMode: RepeatModeType;
  isLoading: boolean;
  error: string | null;
}

interface PlayQueueOptions {
  /** Force shuffle on for this queue (and turn shuffle mode on). */
  shuffle?: boolean;
}

interface PlayerActions {
  playTrack: (track: Track) => Promise<void>;
  playQueue: (tracks: Track[], startIndex?: number, options?: PlayQueueOptions) => Promise<void>;
  shufflePlay: (tracks: Track[]) => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeatMode: () => Promise<void>;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
}

type PlayerStore = PlayerState & PlayerActions;

/** Downloaded tracks play from disk; others get a placeholder resolved on track change. */
function lazyTrackSource(track: Track): PlayerTrackSource {
  return getLocalTrackSource(track) ?? { url: PLACEHOLDER_URL };
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // State
      currentTrack: null,
      queue: [],
      originalQueue: [],
      recentlyPlayed: [],
      isPlaying: false,
      shuffleMode: 'off' as ShuffleMode,
      repeatMode: 'off' as RepeatModeType,
      isLoading: false,
      error: null,

      // Actions
      playTrack: async (track: Track) => {
        // Latest-wins: grab a unique nonce; bail out if superseded
        const myNonce = ++_switchNonce;
        _switchingTrackId = track.id;
        set({ isLoading: true, error: null, queue: [track], originalQueue: [track] });
        try {
          const source = await resolveTrackSource(track);
          if (myNonce !== _switchNonce) return;

          await TrackPlayer.reset();
          if (myNonce !== _switchNonce) return;
          await TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(get().repeatMode));
          if (myNonce !== _switchNonce) return;

          await TrackPlayer.add(toTrackPlayerTrack(track, source));
          if (myNonce !== _switchNonce) return;

          await TrackPlayer.play();
          if (myNonce !== _switchNonce) return;

          await TrackPlayer.seekTo(0);
          if (myNonce !== _switchNonce) return;

          // Add to recently played
          const recent = get().recentlyPlayed.filter((t) => t.id !== track.id);
          recent.unshift(track);

          set({
            currentTrack: track,
            isPlaying: true,
            isLoading: false,
            recentlyPlayed: recent.slice(0, MAX_RECENT_TRACKS),
          });
        } catch (err: unknown) {
          // Only show error if we're still the active switch
          if (myNonce === _switchNonce) {
            set({
              isLoading: false,
              error: err instanceof Error ? err.message : 'Failed to play track',
            });
          }
        } finally {
          if (myNonce === _switchNonce) {
            _switchingTrackId = null;
          }
        }
      },

      playQueue: async (tracks: Track[], startIndex = 0, options: PlayQueueOptions = {}) => {
        if (tracks.length === 0) return;

        const safeStartIndex = tracks[startIndex] ? startIndex : 0;
        const firstTrack = tracks[safeStartIndex];
        const shuffle = options.shuffle ?? get().shuffleMode === 'on';

        // With shuffle on, the chosen track plays first and the rest follow in random order
        const orderedTracks = shuffle
          ? [firstTrack, ...shuffleArray(tracks.filter((_, i) => i !== safeStartIndex))]
          : tracks;
        const playIndex = shuffle ? 0 : safeStartIndex;

        // Latest-wins: grab a unique nonce; bail out if superseded
        const myNonce = ++_switchNonce;
        _switchingTrackId = firstTrack.id;
        set({
          isLoading: true,
          error: null,
          queue: orderedTracks,
          originalQueue: tracks,
          ...(options.shuffle ? { shuffleMode: 'on' as ShuffleMode } : {}),
        });

        try {
          const firstTrackSource = await resolveTrackSource(firstTrack);
          if (myNonce !== _switchNonce) return;

          await TrackPlayer.reset();
          if (myNonce !== _switchNonce) return;
          await TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(get().repeatMode));
          if (myNonce !== _switchNonce) return;

          // Add all tracks to the queue
          const trackPlayerTracks = orderedTracks.map((track, i) =>
            toTrackPlayerTrack(
              track,
              i === playIndex ? firstTrackSource : lazyTrackSource(track)
            )
          );

          await TrackPlayer.add(trackPlayerTracks);
          if (myNonce !== _switchNonce) return;
          if (playIndex > 0) {
            await TrackPlayer.skip(playIndex);
            if (myNonce !== _switchNonce) return;
          }
          await TrackPlayer.play();
          if (myNonce !== _switchNonce) return;
          await TrackPlayer.seekTo(0);
          if (myNonce !== _switchNonce) return;

          const recent = get().recentlyPlayed.filter((t) => t.id !== firstTrack.id);
          recent.unshift(firstTrack);

          set({
            currentTrack: firstTrack,
            isPlaying: true,
            isLoading: false,
            recentlyPlayed: recent.slice(0, MAX_RECENT_TRACKS),
          });

          getUpcomingTracks(1).then(prefetchStreams, () => {});
        } catch (err: unknown) {
          if (myNonce === _switchNonce) {
            set({
              isLoading: false,
              error: err instanceof Error ? err.message : 'Failed to play queue',
            });
          }
        } finally {
          if (myNonce === _switchNonce) {
            _switchingTrackId = null;
          }
        }
      },

      shufflePlay: async (tracks: Track[]) => {
        if (tracks.length === 0) return;
        const startIndex = Math.floor(Math.random() * tracks.length);
        await get().playQueue(tracks, startIndex, { shuffle: true });
      },

      addToQueue: async (track: Track) => {
        const { queue, originalQueue } = get();
        set({ queue: [...queue, track], originalQueue: [...originalQueue, track] });

        try {
          const source = await resolveTrackSource(track);
          await TrackPlayer.add(toTrackPlayerTrack(track, source));
        } catch (err: unknown) {
          console.warn('Failed to add to queue:', err);
        }
      },

      removeFromQueue: async (index: number) => {
        const { queue, originalQueue } = get();
        const removed = queue[index];
        if (!removed) return;

        const newQueue = [...queue];
        newQueue.splice(index, 1);
        const newOriginalQueue = [...originalQueue];
        const originalIndex = newOriginalQueue.findIndex((t) => t.id === removed.id);
        if (originalIndex !== -1) newOriginalQueue.splice(originalIndex, 1);

        set({ queue: newQueue, originalQueue: newOriginalQueue });
        try {
          await TrackPlayer.remove(index);
        } catch {}
      },

      clearQueue: async () => {
        set({ queue: [], originalQueue: [] });
        try {
          await TrackPlayer.reset();
        } catch (err) {
          console.warn('Failed to clear queue:', err);
        }
      },

      togglePlayPause: async () => {
        const { isPlaying } = get();
        try {
          if (isPlaying) {
            await TrackPlayer.pause();
          } else {
            await TrackPlayer.play();
          }
          set({ isPlaying: !isPlaying });
        } catch (err) {
          console.warn('Failed to toggle play/pause:', err);
        }
      },

      skipToNext: async () => {
        try {
          await TrackPlayer.skipToNext();
          // currentTrack is updated by PlaybackActiveTrackChanged event
        } catch (err) {
          console.warn('Failed to skip to next:', err);
        }
      },

      skipToPrevious: async () => {
        try {
          await TrackPlayer.skipToPrevious();
          // currentTrack is updated by PlaybackActiveTrackChanged event
        } catch (err) {
          console.warn('Failed to skip to previous:', err);
        }
      },

      seekTo: async (position: number) => {
        try {
          await TrackPlayer.seekTo(position);
        } catch (err) {
          console.warn('Failed to seek:', err);
        }
      },

      toggleShuffle: async () => {
        // Ignore taps while a track switch, placeholder swap or another reorder
        // is in flight; the queue being changed would not match the new mode.
        if (_isReorderingQueue || _isSwappingTrack || _switchingTrackId != null) return;

        const { shuffleMode, queue, originalQueue } = get();
        const nextMode: ShuffleMode = shuffleMode === 'off' ? 'on' : 'off';

        _isReorderingQueue = true;
        try {
          const activeIndex = await TrackPlayer.getActiveTrackIndex();
          const tpQueue = await TrackPlayer.getQueue();

          // The playing track's stream is still being resolved; ignore until it plays
          if (activeIndex != null && tpQueue[activeIndex]?.url === PLACEHOLDER_URL) return;

          // Nothing to reorder: just remember the mode for the next queue
          if (
            activeIndex == null ||
            queue.length < 2 ||
            tpQueue.length !== queue.length ||
            !queue[activeIndex] ||
            String(tpQueue[activeIndex].id) !== queue[activeIndex].id
          ) {
            set({ shuffleMode: nextMode });
            return;
          }

          const current = queue[activeIndex];
          let newQueue: Track[];
          let newActiveIndex: number;

          if (nextMode === 'on') {
            newQueue = [current, ...shuffleArray(queue.filter((_, i) => i !== activeIndex))];
            newActiveIndex = 0;
          } else {
            newQueue = originalQueue.length === queue.length ? originalQueue : queue;
            newActiveIndex = newQueue.findIndex((t) => t.id === current.id);
            if (newActiveIndex === -1) {
              newQueue = queue;
              newActiveIndex = activeIndex;
            }
          }

          // Reuse the TrackPlayer entries so already-resolved stream URLs are kept
          const tpTrackById = new Map<string, AddTrack>();
          tpQueue.forEach((t) => tpTrackById.set(String(t.id), t));
          const toTpTrack = (track: Track): AddTrack =>
            tpTrackById.get(track.id) ?? toTrackPlayerTrack(track, lazyTrackSource(track));

          const before = newQueue.slice(0, newActiveIndex).map(toTpTrack);
          const after = newQueue.slice(newActiveIndex + 1).map(toTpTrack);

          // Update the store first so any active-track event maps indexes to the new order
          set({ queue: newQueue, shuffleMode: nextMode, currentTrack: current });

          // Rebuild the TrackPlayer queue around the playing track without interrupting it
          await TrackPlayer.removeUpcomingTracks();
          if (activeIndex > 0) {
            await TrackPlayer.remove(Array.from({ length: activeIndex }, (_, i) => i));
          }
          if (after.length > 0) await TrackPlayer.add(after);
          if (before.length > 0) await TrackPlayer.add(before, 0);
        } catch (err) {
          console.warn('Failed to toggle shuffle:', err);
        } finally {
          // Let any trailing active-track events from the reorder pass first
          setTimeout(() => {
            _isReorderingQueue = false;
          }, 100);
        }
      },

      cycleRepeatMode: async () => {
        const { repeatMode } = get();
        const next: RepeatModeType =
          repeatMode === 'off' ? 'queue' : repeatMode === 'queue' ? 'track' : 'off';

        try {
          await TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(next));
          set({ repeatMode: next });
        } catch (err) {
          console.warn('Failed to set repeat mode:', err);
        }
      },

      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setCurrentTrack: (track) => set({ currentTrack: track }),
      setError: (error) => set({ error }),
      setIsLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'player-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (state) => ({
        recentlyPlayed: state.recentlyPlayed,
        shuffleMode: state.shuffleMode,
        repeatMode: state.repeatMode,
      }),
      // Saved local paths go stale when iOS moves the app container
      // (reinstall / re-sideload), so rebuild them on every load.
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PlayerState>;
        return {
          ...currentState,
          ...persisted,
          recentlyPlayed: (persisted.recentlyPlayed ?? currentState.recentlyPlayed).map(
            withCurrentLocalPaths
          ),
        };
      },
    }
  )
);
