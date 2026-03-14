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
        if (!query.trim()) {
          set({ results: [], isSearching: false });
          return;
        }

        // Check cache first
        const cache = get().queryCache;
        if (cache[query]) {
          set({ results: cache[query], isSearching: false, error: null, query });
          get().addToHistory(query.trim());
          return;
        }

        set({ isSearching: true, error: null, query });

        try {
          const results = await searchYouTube(query);
          
          // Save to cache and update state
          set((state) => ({ 
            results, 
            isSearching: false,
            queryCache: { ...state.queryCache, [query]: results }
          }));

          // Add to search history
          get().addToHistory(query.trim());
        } catch (err: any) {
          set({
            isSearching: false,
            error: err.message || 'Search failed',
            results: [],
          });
        }
      },

      clearResults: () => set({ results: [], query: '', error: null }),

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
