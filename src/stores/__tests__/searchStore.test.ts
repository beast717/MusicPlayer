let mockSearch: (query: string) => Promise<{ videoId: string }[]>;

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

jest.mock('../../services/youtube', () => ({
  searchYouTube: (query: string) => mockSearch(query),
}));

import { useSearchStore } from '../searchStore';

const state = () => useSearchStore.getState();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  useSearchStore.setState({ results: [], query: '', queryCache: {}, isSearching: false, error: null });
  mockSearch = async (q) => [{ videoId: q }];
});

it('does not let a slower, older search overwrite newer results', async () => {
  mockSearch = async (q) => {
    await wait(q === 'slow' ? 40 : 5);
    return [{ videoId: q }];
  };

  await Promise.all([state().search('slow'), state().search('fast')]);

  expect(state().results).toEqual([{ videoId: 'fast' }]);
  expect(state().query).toBe('fast');
  expect(state().isSearching).toBe(false);
});

it('caps the query cache at 30 and evicts the oldest first', async () => {
  // Numeric queries would reorder plain object keys; the cache must still evict by age
  for (let i = 0; i < 40; i++) await state().search(String(2000 + i));

  const keys = Object.keys(state().queryCache);
  expect(keys).toHaveLength(30);
  expect(keys).not.toContain('q:2000');
  expect(keys).toContain('q:2010');
  expect(keys).toContain('q:2039');
});

it('serves cache hits regardless of case and surrounding whitespace', async () => {
  await state().search('Drake');
  const searchSpy = jest.fn(async () => []);
  mockSearch = searchSpy;

  await state().search('  drake ');

  expect(searchSpy).not.toHaveBeenCalled();
  expect(state().results).toEqual([{ videoId: 'Drake' }]);
});

it('clearResults drops an in-flight search', async () => {
  mockSearch = async (q) => {
    await wait(20);
    return [{ videoId: q }];
  };

  const p = state().search('cleared');
  state().clearResults();
  await p;

  expect(state().results).toEqual([]);
  expect(state().isSearching).toBe(false);
});
