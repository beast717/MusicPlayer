const mockApi = {
  songs: async (query: string): Promise<any[]> => [{ id: query, title: query }],
  videos: async (query: string): Promise<any[]> => [
    { videoId: `v-${query}`, title: query, uploaderName: 'Channel', duration: 60, thumbnailUrl: 'https://img' },
  ],
  albums: async (query: string): Promise<any[]> => [{ id: `album-${query}`, title: query }],
  artists: async (query: string): Promise<any[]> => [{ id: `artist-${query}`, name: query }],
  playlists: async (query: string): Promise<any[]> => [{ id: `pl-${query}`, title: query }],
  suggestions: async (text: string): Promise<string[]> => [`${text} one`, `${text} two`],
};

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

jest.mock('../../services/youtube', () => ({
  searchYouTube: (query: string) => mockApi.videos(query),
}));

jest.mock('../../services/musicCatalog', () => ({
  searchSongs: (query: string) => mockApi.songs(query),
  searchAlbums: (query: string) => mockApi.albums(query),
  searchArtists: (query: string) => mockApi.artists(query),
  searchPlaylists: (query: string) => mockApi.playlists(query),
  getSearchSuggestions: (text: string) => mockApi.suggestions(text),
}));

import { useSearchStore } from '../searchStore';

const original = { ...mockApi };
const state = () => useSearchStore.getState();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const resultIds = () => state().results.map((item) => item.id);

beforeEach(() => {
  Object.assign(mockApi, original);
  useSearchStore.setState({
    results: [],
    suggestions: [],
    query: '',
    submittedQuery: '',
    filter: 'songs',
    queryCache: {},
    searchHistory: [],
    isSearching: false,
    error: null,
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('does not let a slower, older search overwrite newer results', async () => {
  mockApi.songs = async (q) => {
    await wait(q === 'slow' ? 40 : 5);
    return [{ id: q }];
  };

  await Promise.all([state().search('slow'), state().search('fast')]);

  expect(resultIds()).toEqual(['fast']);
  expect(state()).toMatchObject({ query: 'fast', submittedQuery: 'fast', isSearching: false });
});

it('caps the query cache at 30 and evicts the oldest first', async () => {
  // Numeric queries would reorder plain object keys; the cache must still evict by age
  for (let i = 0; i < 40; i++) await state().search(String(2000 + i));

  const keys = Object.keys(state().queryCache);
  expect(keys).toHaveLength(30);
  expect(keys).not.toContain('songs:2000');
  expect(keys).toContain('songs:2010');
  expect(keys).toContain('songs:2039');
});

it('serves cache hits regardless of case and surrounding whitespace', async () => {
  await state().search('Drake');
  const searchSpy = jest.fn(async () => []);
  mockApi.songs = searchSpy;

  await state().search('  drake ');

  expect(searchSpy).not.toHaveBeenCalled();
  expect(resultIds()).toEqual(['Drake']);
});

it('clearResults drops an in-flight search', async () => {
  mockApi.songs = async (q) => {
    await wait(20);
    return [{ id: q }];
  };

  const p = state().search('cleared');
  state().clearResults();
  await p;

  expect(state().results).toEqual([]);
  expect(state()).toMatchObject({ isSearching: false, submittedQuery: '' });
});

it('returns each result type in the shape the screen renders', async () => {
  await state().search('adele', 'songs');
  expect(state().results[0]).toMatchObject({ type: 'track', id: 'adele' });

  await state().setFilter('videos');
  expect(state().results[0]).toEqual({
    type: 'track',
    id: 'v-adele',
    track: { id: 'v-adele', title: 'adele', artist: 'Channel', duration: 60, thumbnailUrl: 'https://img' },
  });

  await state().setFilter('albums');
  expect(state().results[0]).toMatchObject({ type: 'album', id: 'album-adele' });

  await state().setFilter('artists');
  expect(state().results[0]).toMatchObject({ type: 'artist', id: 'artist-adele' });

  await state().setFilter('playlists');
  expect(state().results[0]).toMatchObject({ type: 'playlist', id: 'pl-adele' });
  expect(state()).toMatchObject({ filter: 'playlists', submittedQuery: 'adele' });
});

it('caches per filter and remembers the filter without a search', async () => {
  const songs = jest.fn(async (q: string) => [{ id: q }]);
  const albums = jest.fn(async (q: string) => [{ id: `album-${q}` }]);
  mockApi.songs = songs;
  mockApi.albums = albums;

  await state().search('adele');
  await state().setFilter('albums');
  await state().setFilter('songs');
  expect(songs).toHaveBeenCalledTimes(1);
  expect(albums).toHaveBeenCalledTimes(1);
  expect(resultIds()).toEqual(['adele']);

  state().clearResults();
  await state().setFilter('artists');
  expect(state()).toMatchObject({ filter: 'artists', results: [], isSearching: false });
});

it('adds searches to the history once, newest first', async () => {
  await state().search('adele');
  await state().search('burna boy');
  await state().search('Adele');

  expect(state().searchHistory).toEqual(['Adele', 'burna boy']);
});

it('reports a failed search and keeps it out of the history and cache', async () => {
  mockApi.songs = async () => {
    throw new Error('YouTube Music returned 500');
  };

  await state().search('adele');

  expect(state().error).toMatch(/Search failed/);
  expect(state()).toMatchObject({ results: [], isSearching: false, searchHistory: [], queryCache: {} });
});

describe('suggestions', () => {
  it('loads suggestions for the typed text', async () => {
    await state().loadSuggestions('ade');
    expect(state().suggestions).toEqual(['ade one', 'ade two']);

    await state().loadSuggestions('   ');
    expect(state().suggestions).toEqual([]);
  });

  it('keeps only the suggestions for the latest text', async () => {
    mockApi.suggestions = async (text) => {
      await wait(text === 'a' ? 40 : 5);
      return [text];
    };

    await Promise.all([state().loadSuggestions('a'), state().loadSuggestions('ad')]);

    expect(state().suggestions).toEqual(['ad']);
  });

  it('are dropped once the text is searched for', async () => {
    mockApi.suggestions = async (text) => {
      await wait(30);
      return [text];
    };

    const pending = state().loadSuggestions('adele');
    await state().search('adele');
    await pending;

    expect(state().suggestions).toEqual([]);
  });

  it('fail silently', async () => {
    mockApi.suggestions = async () => {
      throw new Error('offline');
    };

    await state().loadSuggestions('ade');

    expect(state()).toMatchObject({ suggestions: [], error: null });
  });
});
