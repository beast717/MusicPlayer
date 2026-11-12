import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Track, AlbumSummary, ArtistSummary, PlaylistSummary } from '../types';
import { zustandMMKVStorage } from '../services/storage';
import { MAX_SEARCH_HISTORY } from '../utils/constants';
import { searchYouTube } from '../services/youtube';
import {
  searchSongs,
  searchAlbums,
  searchArtists,
  searchPlaylists,
  getSearchSuggestions,
} from '../services/musicCatalog';

/** `songs` to `playlists` search YouTube Music; `videos` searches all of YouTube. */
export type SearchFilter = 'songs' | 'videos' | 'albums' | 'artists' | 'playlists';

export type SearchItem =
  | { type: 'track'; id: string; track: Track }
  | { type: 'album'; id: string; album: AlbumSummary }
  | { type: 'artist'; id: string; artist: ArtistSummary }
  | { type: 'playlist'; id: string; playlist: PlaylistSummary };

interface SearchState {
  /** The text in the search field. */
  query: string;
  /** The query the current results belong to ('' before the first search). */
  submittedQuery: string;
  filter: SearchFilter;
  results: SearchItem[];
  /** Autocomplete suggestions for the text being typed. */
  suggestions: string[];
  searchHistory: string[];
  isSearching: boolean;
  error: string | null;
  queryCache: Record<string, SearchItem[]>;
}

interface SearchActions {
  setQuery: (query: string) => void;
  /** Run a search with the current filter, or with `filter` and make it current. */
  search: (query: string, filter?: SearchFilter) => Promise<void>;
  /** Switch result type and repeat the last search with it. */
  setFilter: (filter: SearchFilter) => Promise<void>;
  loadSuggestions: (text: string) => Promise<void>;
  clearResults: () => void;
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
  setError: (error: string | null) => void;
}

type SearchStore = SearchState & SearchActions;

const MAX_CACHED_QUERIES = 30;

let _searchCounter = 0;
let _suggestionCounter = 0;

// Prefixed by the filter, which also keeps numeric queries like "2024" in
// insertion order in the object
function toCacheKey(query: string, filter: SearchFilter): string {
  return `${filter}:${query.trim().toLowerCase()}`;
}

/** Insert a result set, evicting the oldest queries beyond the limit. */
function addToCache(
  cache: Record<string, SearchItem[]>,
  key: string,
  results: SearchItem[]
): Record<string, SearchItem[]> {
  const { [key]: _, ...rest } = cache;
  const keys = Object.keys(rest);
  const kept = keys.slice(Math.max(0, keys.length - (MAX_CACHED_QUERIES - 1)));
  const next: Record<string, SearchItem[]> = {};
  for (const k of kept) next[k] = rest[k];
  next[key] = results;
  return next;
}

async function runSearch(query: string, filter: SearchFilter): Promise<SearchItem[]> {
  switch (filter) {
    case 'songs':
      return (await searchSongs(query)).map((track) => ({
        type: 'track',
        id: track.id,
        track,
      }));
    case 'videos':
      return (await searchYouTube(query)).map((result) => ({
        type: 'track',
        id: result.videoId,
        track: {
          id: result.videoId,
          title: result.title,
          artist: result.uploaderName,
          duration: result.duration,
          thumbnailUrl: result.thumbnailUrl,
        },
      }));
    case 'albums':
      return (await searchAlbums(query)).map((album) => ({
        type: 'album',
        id: album.id,
        album,
      }));
    case 'artists':
      return (await searchArtists(query)).map((artist) => ({
        type: 'artist',
        id: artist.id,
        artist,
      }));
    case 'playlists':
      return (await searchPlaylists(query)).map((playlist) => ({
        type: 'playlist',
        id: playlist.id,
        playlist,
      }));
  }
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set, get) => ({
      query: '',
      submittedQuery: '',
      filter: 'songs' as SearchFilter,
      results: [],
      suggestions: [],
      searchHistory: [],
      isSearching: false,
      error: null,
      queryCache: {},

      setQuery: (query: string) => set({ query }),

      search: async (rawQuery: string, filter: SearchFilter = get().filter) => {
        // Latest-wins: a slower, older search must not overwrite newer results
        const mySearchId = ++_searchCounter;
        // Suggestions for the text that was just searched are no longer wanted
        _suggestionCounter++;

        const query = rawQuery.trim();
        if (!query) {
          set({ results: [], submittedQuery: '', isSearching: false, suggestions: [] });
          return;
        }

        // Check cache first
        const cacheKey = toCacheKey(query, filter);
        const cached = get().queryCache[cacheKey];
        if (cached) {
          set({
            results: cached,
            isSearching: false,
            error: null,
            query,
            submittedQuery: query,
            filter,
            suggestions: [],
          });
          get().addToHistory(query);
          return;
        }

        set({
          isSearching: true,
          error: null,
          query,
          submittedQuery: query,
          filter,
          results: [],
          suggestions: [],
        });

        try {
          const results = await runSearch(query, filter);
          if (mySearchId !== _searchCounter) return;

          // Save to cache and update state
          set((state) => ({
            results,
            isSearching: false,
            queryCache: addToCache(state.queryCache, cacheKey, results),
          }));

          // Add to search history
          get().addToHistory(query);
        } catch (err: any) {
          if (mySearchId !== _searchCounter) return;
          set({
            isSearching: false,
            error: 'Search failed. Please check your internet connection and try again.',
            results: [],
          });
          console.warn('Search failed:', err?.message ?? err);
        }
      },

      setFilter: async (filter: SearchFilter) => {
        const { submittedQuery } = get();
        if (!submittedQuery) {
          set({ filter });
          return;
        }
        await get().search(submittedQuery, filter);
      },

      loadSuggestions: async (text: string) => {
        const mySuggestionId = ++_suggestionCounter;
        if (!text.trim()) {
          set({ suggestions: [] });
          return;
        }

        try {
          const suggestions = await getSearchSuggestions(text.trim());
          if (mySuggestionId !== _suggestionCounter) return;
          set({ suggestions });
        } catch {
          // Suggestions are a convenience: typing and searching still work
          if (mySuggestionId === _suggestionCounter) set({ suggestions: [] });
        }
      },

      clearResults: () => {
        // Drop any in-flight search so it can't repopulate cleared results
        _searchCounter++;
        _suggestionCounter++;
        set({
          results: [],
          suggestions: [],
          query: '',
          submittedQuery: '',
          error: null,
          isSearching: false,
        });
      },

      addToHistory: (query: string) => {
        set((state) => {
          const filtered = state.searchHistory.filter(
            (q) => q.toLowerCase() !== query.toLowerCase()
          );
          return {
            searchHistory: [query, ...filtered].slice(0, MAX_SEARCH_HISTORY),
          };
        });
      },

      removeFromHistory: (query: string) => {
        set((state) => ({
          searchHistory: state.searchHistory.filter((q) => q !== query),
        }));
      },

      clearHistory: () => set({ searchHistory: [] }),

      setError: (error) => set({ error }),
    }),
    {
      name: 'search-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (state) => ({
        searchHistory: state.searchHistory,
        filter: state.filter,
      }),
    }
  )
);
