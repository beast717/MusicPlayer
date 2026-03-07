import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Track } from '../types';
import { zustandMMKVStorage } from '../services/storage';
import {
  downloadTrack as downloadTrackFile,
  deleteDownload as deleteDownloadFile,
  DownloadProgress,
} from '../services/downloadManager';
import { useLibraryStore } from './libraryStore';

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

interface ActiveDownload {
  track: Track;
  status: DownloadStatus;
  progress: number; // 0-1
  error?: string;
}

interface DownloadState {
  activeDownloads: Record<string, ActiveDownload>;
}

interface DownloadActions {
  startDownload: (track: Track) => Promise<void>;
  cancelDownload: (videoId: string) => void;
  removeDownload: (videoId: string) => Promise<void>;
  getDownloadStatus: (videoId: string) => DownloadStatus | null;
  getDownloadProgress: (videoId: string) => number;
}

type DownloadStore = DownloadState & DownloadActions;

export const useDownloadStore = create<DownloadStore>()((set, get) => ({
  activeDownloads: {},

  startDownload: async (track: Track) => {
    const { activeDownloads } = get();
    if (activeDownloads[track.id]?.status === 'downloading') return;

    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [track.id]: {
          track,
          status: 'downloading' as DownloadStatus,
          progress: 0,
        },
      },
    }));

    try {
      const result = await downloadTrackFile(track, (progress: DownloadProgress) => {
        set((state) => ({
          activeDownloads: {
            ...state.activeDownloads,
            [track.id]: {
              ...state.activeDownloads[track.id],
              progress: progress.progress,
            },
          },
        }));
      });

      // Update library store with downloaded track
      const downloadedTrack: Track = {
        ...track,
        localFilePath: result.filePath,
        localThumbnailPath: result.thumbnailPath,
      };

      useLibraryStore.getState().addDownloadedTrack(downloadedTrack);

      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [track.id]: {
            track: downloadedTrack,
            status: 'completed' as DownloadStatus,
            progress: 1,
          },
        },
      }));

      // Remove from active downloads after a brief delay
      setTimeout(() => {
        set((state) => {
          const { [track.id]: _, ...rest } = state.activeDownloads;
          return { activeDownloads: rest };
        });
      }, 2000);
    } catch (err: any) {
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [track.id]: {
            ...state.activeDownloads[track.id],
            status: 'failed' as DownloadStatus,
            error: err.message,
          },
        },
      }));
    }
  },

  cancelDownload: (videoId: string) => {
    set((state) => {
      const { [videoId]: _, ...rest } = state.activeDownloads;
      return { activeDownloads: rest };
    });
  },

  removeDownload: async (videoId: string) => {
    await deleteDownloadFile(videoId);
    useLibraryStore.getState().removeDownloadedTrack(videoId);
    set((state) => {
      const { [videoId]: _, ...rest } = state.activeDownloads;
      return { activeDownloads: rest };
    });
  },

  getDownloadStatus: (videoId: string) => {
    const dl = get().activeDownloads[videoId];
    if (dl) return dl.status;
    if (useLibraryStore.getState().isDownloaded(videoId)) return 'completed';
    return null;
  },

  getDownloadProgress: (videoId: string) => {
    return get().activeDownloads[videoId]?.progress || 0;
  },
}));
