import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import TrackPlayer, { RepeatMode, TrackType } from 'react-native-track-player';
import { ResolvedAudioSource, Track } from '../types';
import { getAudioPlaybackSource } from '../services/youtube';
import { zustandMMKVStorage } from '../services/storage';
import { MAX_RECENT_TRACKS } from '../utils/constants';

const IOS_REMOTE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';

type PlayerTrackSource = {
  url: string;
  type?: TrackType;
  contentType?: string;
  userAgent?: string;
  streamDebug?: string;
};

function getUrlHost(url: string): string {
  try {
    return new URL(url).host || 'unknown-host';
  } catch {
    return 'invalid-url';
  }
}

function buildTrackPlayerSource(source: ResolvedAudioSource): PlayerTrackSource {
  const baseSource: PlayerTrackSource = {
    url: source.url,
    contentType: source.mimeType,
    streamDebug: `streamType=${source.streamType} mimeType=${source.mimeType} host=${getUrlHost(source.url)}`,
  };

  if (Platform.OS === 'ios') {
    baseSource.userAgent = IOS_REMOTE_USER_AGENT;
  }

  if (source.streamType === 'hls') {
    baseSource.type = TrackType.HLS;
  }

  return baseSource;
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
        set({ isLoading: true, error: null, queue: [track] });
        try {
          const source = track.localFilePath
            ? { url: track.localFilePath }
            : buildTrackPlayerSource(await getAudioPlaybackSource(track.id));

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
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to play track',
          });
        }
      },

      playQueue: async (tracks: Track[], startIndex = 0) => {
        if (tracks.length === 0) return;
        set({ isLoading: true, error: null, queue: tracks });

        try {
          const firstTrack = tracks[startIndex] || tracks[0];
          const firstTrackSource = firstTrack.localFilePath
            ? { url: firstTrack.localFilePath }
            : buildTrackPlayerSource(
                await getAudioPlaybackSource(firstTrack.id)
              );

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
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to play queue',
          });
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
