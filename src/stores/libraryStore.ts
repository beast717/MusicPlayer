import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Track, Playlist } from '../types';
import { zustandMMKVStorage } from '../services/storage';
import { generateId } from '../utils/helpers';

interface LibraryState {
  playlists: Playlist[];
  favorites: Track[];
  downloadedTracks: Track[];
}

interface LibraryActions {
  // Playlists
  createPlaylist: (name: string) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  getPlaylist: (id: string) => Playlist | undefined;

  // Favorites
  toggleFavorite: (track: Track) => void;
  isFavorite: (trackId: string) => boolean;

  // Downloads
  addDownloadedTrack: (track: Track) => void;
  removeDownloadedTrack: (trackId: string) => void;
  isDownloaded: (trackId: string) => boolean;
  getDownloadedTrack: (trackId: string) => Track | undefined;
}

type LibraryStore = LibraryState & LibraryActions;

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      playlists: [],
      favorites: [],
      downloadedTracks: [],

      // Playlists
      createPlaylist: (name: string) => {
        const now = Date.now();
        const playlist: Playlist = {
          id: generateId(),
          name,
          tracks: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ playlists: [...state.playlists, playlist] }));
        return playlist;
      },

      deletePlaylist: (id: string) => {
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
        }));
      },

      renamePlaylist: (id: string, name: string) => {
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
        }));
      },

      addToPlaylist: (playlistId: string, track: Track) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            // Don't add duplicates
            if (p.tracks.some((t) => t.id === track.id)) return p;
            return {
              ...p,
              tracks: [...p.tracks, track],
              coverUrl: p.coverUrl || track.thumbnailUrl,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      removeFromPlaylist: (playlistId: string, trackId: string) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            return {
              ...p,
              tracks: p.tracks.filter((t) => t.id !== trackId),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const tracks = [...p.tracks];
            const [removed] = tracks.splice(fromIndex, 1);
            tracks.splice(toIndex, 0, removed);
            return { ...p, tracks, updatedAt: Date.now() };
          }),
        }));
      },

      getPlaylist: (id: string) => {
        return get().playlists.find((p) => p.id === id);
      },

      // Favorites
      toggleFavorite: (track: Track) => {
        set((state) => {
          const exists = state.favorites.some((t) => t.id === track.id);
          return {
            favorites: exists
              ? state.favorites.filter((t) => t.id !== track.id)
              : [track, ...state.favorites],
          };
        });
      },

      isFavorite: (trackId: string) => {
        return get().favorites.some((t) => t.id === trackId);
      },

      // Downloads
      addDownloadedTrack: (track: Track) => {
        set((state) => {
          const exists = state.downloadedTracks.some((t) => t.id === track.id);
          if (exists) {
            return {
              downloadedTracks: state.downloadedTracks.map((t) =>
                t.id === track.id ? track : t
              ),
            };
          }
          return { downloadedTracks: [...state.downloadedTracks, track] };
        });
      },

      removeDownloadedTrack: (trackId: string) => {
        set((state) => ({
          downloadedTracks: state.downloadedTracks.filter((t) => t.id !== trackId),
        }));
      },

      isDownloaded: (trackId: string) => {
        return get().downloadedTracks.some((t) => t.id === trackId);
      },

      getDownloadedTrack: (trackId: string) => {
        return get().downloadedTracks.find((t) => t.id === trackId);
      },
    }),
    {
      name: 'library-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
    }
  )
);
