import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Track } from '../types';
import { zustandMMKVStorage } from '../services/storage';

/** How the user has listened to one track. Drives the home screen recommendations. */
export interface TrackStats {
  track: Track;
  playCount: number;
  skipCount: number;
  firstPlayedAt: number;
  lastPlayedAt: number;
}

export const MAX_HISTORY_TRACKS = 1000;

interface HistoryState {
  stats: Record<string, TrackStats>;
}

interface HistoryActions {
  /** The track was actually listened to (not just started). */
  recordPlay: (track: Track, at?: number) => void;
  /** The track was abandoned shortly after it started. */
  recordSkip: (track: Track, at?: number) => void;
  clearHistory: () => void;
}

type HistoryStore = HistoryState & HistoryActions;

// Local file paths go stale when iOS moves the app container, and playback
// looks downloads up in the library anyway, so history keeps metadata only.
function toHistoryTrack(track: Track): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    thumbnailUrl: track.thumbnailUrl,
  };
}

/** Keep the most recently touched tracks when the history is full. */
function evictOldest(stats: Record<string, TrackStats>): Record<string, TrackStats> {
  const entries = Object.entries(stats);
  if (entries.length <= MAX_HISTORY_TRACKS) return stats;

  entries.sort(([, a], [, b]) => b.lastPlayedAt - a.lastPlayedAt);
  return Object.fromEntries(entries.slice(0, MAX_HISTORY_TRACKS));
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      stats: {},

      recordPlay: (track, at = Date.now()) => {
        set((state) => {
          const existing = state.stats[track.id];
          return {
            stats: evictOldest({
              ...state.stats,
              [track.id]: {
                track: toHistoryTrack(track),
                playCount: (existing?.playCount ?? 0) + 1,
                skipCount: existing?.skipCount ?? 0,
                firstPlayedAt: existing?.firstPlayedAt ?? at,
                lastPlayedAt: at,
              },
            }),
          };
        });
      },

      recordSkip: (track, at = Date.now()) => {
        set((state) => {
          const existing = state.stats[track.id];
          return {
            stats: evictOldest({
              ...state.stats,
              [track.id]: {
                track: toHistoryTrack(track),
                playCount: existing?.playCount ?? 0,
                skipCount: (existing?.skipCount ?? 0) + 1,
                firstPlayedAt: existing?.firstPlayedAt ?? at,
                // A skip is not a listen: keep "last played" for tracks that have one
                lastPlayedAt: existing?.lastPlayedAt ?? at,
              },
            }),
          };
        });
      },

      clearHistory: () => set({ stats: {} }),
    }),
    {
      name: 'history-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
    }
  )
);
