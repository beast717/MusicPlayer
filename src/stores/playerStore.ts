import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import TrackPlayer, { RepeatMode } from 'react-native-track-player';
import { Track } from '../types';
import { getAudioStreamUrl } from '../services/youtube';
import { zustandMMKVStorage } from '../services/storage';
import { MAX_RECENT_TRACKS } from '../utils/constants';

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
        set({ isLoading: true, error: null });
        try {
          let url: string;

          if (track.localFilePath) {
            url = track.localFilePath;
          } else {
            url = await getAudioStreamUrl(track.id);
          }

          await TrackPlayer.reset();
          await TrackPlayer.add({
            id: track.id,
            url,
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
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || 'Failed to play track',
          });
        }
      },

      playQueue: async (tracks: Track[], startIndex = 0) => {
        if (tracks.length === 0) return;
        set({ isLoading: true, error: null, queue: tracks });

        try {
          const firstTrack = tracks[startIndex] || tracks[0];
          let url: string;

          if (firstTrack.localFilePath) {
            url = firstTrack.localFilePath;
          } else {
            url = await getAudioStreamUrl(firstTrack.id);
          }

          await TrackPlayer.reset();

          // Add all tracks to the queue
          const trackPlayerTracks = await Promise.all(
            tracks.map(async (track, i) => {
              let trackUrl: string;
              if (i === startIndex) {
                trackUrl = url; // already fetched
              } else if (track.localFilePath) {
                trackUrl = track.localFilePath;
              } else {
                // Lazy load: use a placeholder, will re-resolve on track change
                trackUrl = '';
              }
              return {
                id: track.id,
                url: trackUrl || 'https://placeholder.invalid',
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
        } catch (err: any) {
          set({
            isLoading: false,
            error: err.message || 'Failed to play queue',
          });
        }
      },

      addToQueue: async (track: Track) => {
        const { queue } = get();
        set({ queue: [...queue, track] });

        try {
          let url = track.localFilePath;
          if (!url) {
            url = await getAudioStreamUrl(track.id);
          }

          await TrackPlayer.add({
            id: track.id,
            url: url!,
            title: track.title,
            artist: track.artist,
            artwork: track.localThumbnailPath || track.thumbnailUrl,
            duration: track.duration,
          });
        } catch (err: any) {
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
        await TrackPlayer.reset();
      },

      togglePlayPause: async () => {
        const { isPlaying } = get();
        if (isPlaying) {
          await TrackPlayer.pause();
        } else {
          await TrackPlayer.play();
        }
        set({ isPlaying: !isPlaying });
      },

      skipToNext: async () => {
        try {
          // Re-resolve stream URL for next track
          const queue = await TrackPlayer.getQueue();
          const currentIndex = await TrackPlayer.getActiveTrackIndex();
          if (currentIndex === undefined || currentIndex === null) return;

          const nextIndex = currentIndex + 1;
          if (nextIndex < queue.length) {
            const nextTrack = get().queue[nextIndex];
            if (nextTrack && !nextTrack.localFilePath) {
              try {
                const url = await getAudioStreamUrl(nextTrack.id);
                await TrackPlayer.updateMetadataForTrack(nextIndex, {
                  ...queue[nextIndex],
                });
                // Update the URL by removing and re-adding
                // TrackPlayer doesn't have updateUrl, so we handle it via track change event
              } catch {}
            }
          }

          await TrackPlayer.skipToNext();
          const { queue: storeQueue } = get();
          if (nextIndex < storeQueue.length) {
            set({ currentTrack: storeQueue[nextIndex] });
          }
        } catch (err) {
          console.warn('Failed to skip to next:', err);
        }
      },

      skipToPrevious: async () => {
        try {
          await TrackPlayer.skipToPrevious();
          const currentIndex = await TrackPlayer.getActiveTrackIndex();
          const { queue: storeQueue } = get();
          if (currentIndex !== undefined && currentIndex !== null && currentIndex < storeQueue.length) {
            set({ currentTrack: storeQueue[currentIndex] });
          }
        } catch (err) {
          console.warn('Failed to skip to previous:', err);
        }
      },

      seekTo: async (position: number) => {
        await TrackPlayer.seekTo(position);
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
