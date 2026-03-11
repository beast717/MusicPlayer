import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import { Track } from '../types';
import { getAudioPlaybackSource } from '../services/youtube';
import { zustandMMKVStorage } from '../services/storage';
import { buildTrackPlayerSource, PlayerTrackSource } from '../services/trackPlayerHelpers';
import { MAX_RECENT_TRACKS } from '../utils/constants';

// ─── Concurrency helpers ────────────────────────────────────────────
// Only one playTrack/playQueue operation may run at a time.
// Rapid taps will wait for the previous operation to finish.
let _playLock: Promise<void> = Promise.resolve();

// When non-null, playTrack/playQueue is actively managing this track.
// The PlaybackActiveTrackChanged handler must NOT overwrite currentTrack
// while this is set.
let _switchingTrackId: string | null = null;

export function getSwitchingTrackId(): string | null {
  return _switchingTrackId;
}


export type ShuffleMode = 'off' | 'on';
export type RepeatModeType = 'off' | 'track' | 'queue';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  recentlyPlayed: Track[];
  isPlaying: boolean;
  shuffleMode: ShuffleMode;
  repeatMode: RepeatModeType;
  isLoading: boolean;
  error: string | null;
}

interface PlayerActions {
  playTrack: (track: Track) => Promise<void>;
  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeatMode: () => Promise<void>;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
}

type PlayerStore = PlayerState & PlayerActions;

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // State
      currentTrack: null,
      queue: [],
      recentlyPlayed: [],
      isPlaying: false,
      shuffleMode: 'off' as ShuffleMode,
      repeatMode: 'off' as RepeatModeType,
      isLoading: false,
      error: null,

      // Actions
      playTrack: async (track: Track) => {
        // Serialize: wait for any in-flight play operation to finish
        const prevLock = _playLock;
        let releaseLock: () => void = () => {};
        _playLock = new Promise<void>((resolve) => { releaseLock = resolve; });
        await prevLock;

        _switchingTrackId = track.id;
        set({ isLoading: true, error: null, queue: [track] });
        try {
          const source = track.localFilePath
            ? { url: track.localFilePath }
            : buildTrackPlayerSource(await getAudioPlaybackSource(track.id));

          // Bail out if another playTrack call started while we were resolving
          if (_switchingTrackId !== track.id) return;

          await TrackPlayer.reset();
          await TrackPlayer.add({
            id: track.id,
            ...source,
            title: track.title,
            artist: track.artist,
            artwork: track.localThumbnailPath || track.thumbnailUrl,
            duration: track.duration,
          });
          await TrackPlayer.play();

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
          if (_switchingTrackId === track.id) {
            set({
              isLoading: false,
              error: err instanceof Error ? err.message : 'Failed to play track',
            });
          }
        } finally {
          if (_switchingTrackId === track.id) {
            _switchingTrackId = null;
          }
          releaseLock();
        }
      },

      playQueue: async (tracks: Track[], startIndex = 0) => {
        if (tracks.length === 0) return;

        // Serialize: wait for any in-flight play operation to finish
        const prevLock = _playLock;
        let releaseLock: () => void = () => {};
        _playLock = new Promise<void>((resolve) => { releaseLock = resolve; });
        await prevLock;

        const firstTrack = tracks[startIndex] || tracks[0];
        _switchingTrackId = firstTrack.id;
        set({ isLoading: true, error: null, queue: tracks });

        try {
          const firstTrackSource = firstTrack.localFilePath
            ? { url: firstTrack.localFilePath }
            : buildTrackPlayerSource(
                await getAudioPlaybackSource(firstTrack.id)
              );

          // Bail out if another play call started while we were resolving
          if (_switchingTrackId !== firstTrack.id) return;

          await TrackPlayer.reset();

          // Add all tracks to the queue
          const trackPlayerTracks = await Promise.all(
            tracks.map(async (track, i) => {
              let trackSource: PlayerTrackSource;
              if (i === startIndex) {
                trackSource = firstTrackSource;
              } else if (track.localFilePath) {
                trackSource = { url: track.localFilePath };
              } else {
                // Lazy load: use a placeholder, will re-resolve on track change
                trackSource = { url: 'https://placeholder.invalid' };
              }
              return {
                id: track.id,
                ...trackSource,
                title: track.title,
                artist: track.artist,
                artwork: track.localThumbnailPath || track.thumbnailUrl,
                duration: track.duration,
              };
            })
          );

          await TrackPlayer.add(trackPlayerTracks);
          if (startIndex > 0) {
            await TrackPlayer.skip(startIndex);
          }
          await TrackPlayer.play();

          const recent = get().recentlyPlayed.filter((t) => t.id !== firstTrack.id);
          recent.unshift(firstTrack);

          set({
            currentTrack: firstTrack,
            isPlaying: true,
            isLoading: false,
            recentlyPlayed: recent.slice(0, MAX_RECENT_TRACKS),
          });
        } catch (err: unknown) {
          if (_switchingTrackId === firstTrack.id) {
            set({
              isLoading: false,
              error: err instanceof Error ? err.message : 'Failed to play queue',
            });
          }
        } finally {
          if (_switchingTrackId === firstTrack.id) {
            _switchingTrackId = null;
          }
          releaseLock();
        }
      },

      addToQueue: async (track: Track) => {
        const { queue } = get();
        set({ queue: [...queue, track] });

        try {
          const source = track.localFilePath
            ? { url: track.localFilePath }
            : buildTrackPlayerSource(await getAudioPlaybackSource(track.id));

          await TrackPlayer.add({
            id: track.id,
            ...source,
            title: track.title,
            artist: track.artist,
            artwork: track.localThumbnailPath || track.thumbnailUrl,
            duration: track.duration,
          });
        } catch (err: unknown) {
          console.warn('Failed to add to queue:', err);
        }
      },

      removeFromQueue: async (index: number) => {
        const { queue } = get();
        const newQueue = [...queue];
        newQueue.splice(index, 1);
        set({ queue: newQueue });
        try {
          await TrackPlayer.remove(index);
        } catch {}
      },

      clearQueue: async () => {
        set({ queue: [] });
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

      toggleShuffle: () => {
        const { shuffleMode } = get();
        set({ shuffleMode: shuffleMode === 'off' ? 'on' : 'off' });
      },

      cycleRepeatMode: async () => {
        const { repeatMode } = get();
        let next: RepeatModeType;
        let trackPlayerMode: RepeatMode;

        switch (repeatMode) {
          case 'off':
            next = 'queue';
            trackPlayerMode = RepeatMode.Queue;
            break;
          case 'queue':
            next = 'track';
            trackPlayerMode = RepeatMode.Track;
            break;
          case 'track':
            next = 'off';
            trackPlayerMode = RepeatMode.Off;
            break;
          default:
            next = 'off';
            trackPlayerMode = RepeatMode.Off;
        }

        await TrackPlayer.setRepeatMode(trackPlayerMode);
        set({ repeatMode: next });
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
    }
  )
);
