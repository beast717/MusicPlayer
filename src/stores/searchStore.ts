import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SearchResult } from '../types';
import { zustandMMKVStorage } from '../services/storage';
import { MAX_SEARCH_HISTORY } from '../utils/constants';
import { searchYouTube } from '../services/youtube';

interface SearchState {
  query: string;
  results: SearchResult[];
  searchHistory: string[];
  isSearching: boolean;
  error: string | null;
  queryCache: Record<string, SearchResult[]>;
}

interface SearchActions {
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearResults: () => void;
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
  setError: (error: string | null) => void;
}

type SearchStore = SearchState & SearchActions;

const MAX_CACHED_QUERIES = 30;

let _searchCounter = 0;

// Prefixed so numeric queries like "2024" keep insertion order in the object
function toCacheKey(query: string): string {
  return `q:${query.trim().toLowerCase()}`;
}

/** Insert a result set, evicting the oldest queries beyond the limit. */
function addToCache(
  cache: Record<string, SearchResult[]>,
  key: string,
  results: SearchResult[]
): Record<string, SearchResult[]> {
  const { [key]: _, ...rest } = cache;
  const keys = Object.keys(rest);
  const kept = keys.slice(Math.max(0, keys.length - (MAX_CACHED_QUERIES - 1)));
  const next: Record<string, SearchResult[]> = {};
  for (const k of kept) next[k] = rest[k];
  next[key] = results;
  return next;
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set, get) => ({
      query: '',
      results: [],
      searchHistory: [],
      isSearching: false,
      error: null,
      queryCache: {},

      setQuery: (query: string) => set({ query }),

      search: async (query: string) => {
        // Latest-wins: a slower, older search must not overwrite newer results
        const mySearchId = ++_searchCounter;

        if (!query.trim()) {
          set({ results: [], isSearching: false });
          return;
        }

        // Check cache first
        const cacheKey = toCacheKey(query);
        const cached = get().queryCache[cacheKey];
        if (cached) {
          set({ results: cached, isSearching: false, error: null, query });
          get().addToHistory(query.trim());
          return;
        }

        set({ isSearching: true, error: null, query });

        try {
          const results = await searchYouTube(query);
          if (mySearchId !== _searchCounter) return;

          // Save to cache and update state
          set((state) => ({
            results,
            isSearching: false,
            queryCache: addToCache(state.queryCache, cacheKey, results),
          }));

          // Add to search history
          get().addToHistory(query.trim());
        } catch (err: any) {
          if (mySearchId !== _searchCounter) return;
          set({
            isSearching: false,
            error: err.message || 'Search failed',
            results: [],
          });
        }
      },

      clearResults: () => {
        // Drop any in-flight search so it can't repopulate cleared results
        _searchCounter++;
        set({ results: [], query: '', error: null, isSearching: false });
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
      }),
    }
  )
);
