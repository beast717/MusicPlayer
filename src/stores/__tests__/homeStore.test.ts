import { Track } from '../../types';

const track = (id: string, artist = `Artist ${id}`): Track => ({
  id,
  title: `Song ${id}`,
  artist,
  duration: 200,
  thumbnailUrl: `https://img/${id}`,
});

const mockState = {
  stats: {} as Record<string, any>,
  notInterested: {} as Record<string, number>,
  recentlyPlayed: [] as Track[],
  favorites: [] as Track[],
  radio: (async () => []) as (id: string, options?: { forceRefresh?: boolean }) => Promise<Track[]>,
};

jest.mock('../../services/youtubeMusic', () => ({
  getRadioTracks: (id: string, options?: { forceRefresh?: boolean }) => mockState.radio(id, options),
}));
jest.mock('../historyStore', () => ({
  useHistoryStore: {
    getState: () => ({ stats: mockState.stats, notInterested: mockState.notInterested }),
  },
}));
jest.mock('../libraryStore', () => ({
  useLibraryStore: { getState: () => ({ favorites: mockState.favorites }) },
}));
jest.mock('../playerStore', () => ({
  usePlayerStore: { getState: () => ({ recentlyPlayed: mockState.recentlyPlayed }) },
}));

import { useHomeStore } from '../homeStore';

const state = () => useHomeStore.getState();
const played = (t: Track, plays: number, minutesAgo = 0) => ({
  track: t,
  playCount: plays,
  skipCount: 0,
  firstPlayedAt: 0,
  lastPlayedAt: Date.now() - minutesAgo * 60_000,
});
const radioFor = (id: string) => [track(id), track(`${id}-r1`), track(`${id}-r2`)];

beforeEach(() => {
  useHomeStore.setState({
    quickPicks: [],
    mixes: [],
    becauseYouListened: null,
    isLoading: false,
    loadFailed: false,
    lastUpdated: null,
  });
  mockState.stats = {};
  mockState.notInterested = {};
  mockState.recentlyPlayed = [];
  mockState.favorites = [];
  mockState.radio = async (id) => radioFor(id);
});

it('builds quick picks, mixes and "because you listened" from the history', async () => {
  mockState.stats = {
    a: played(track('a', 'Adele'), 9),
    b: played(track('b', 'Burna Boy'), 5),
    // Lower score than a and b once there are 5 seeds, but the most recent listen
    ...Object.fromEntries(
      ['c', 'd', 'e'].map((id) => [id, played(track(id), 3, 60)])
    ),
    recent: played(track('recent', 'Zara Larsson'), 1, 1),
  };

  await state().refresh();

  expect(state().mixes.map((m) => m.title)).toEqual([
    'Adele Mix',
    'Burna Boy Mix',
    'Artist c Mix',
    'Artist d Mix',
    'Artist e Mix',
  ]);
  expect(state().quickPicks.map((t) => t.id)).toEqual([
    'a-r1', 'b-r1', 'c-r1', 'd-r1',
    'a-r2', 'b-r2', 'c-r2', 'd-r2',
  ]);
  expect(state().becauseYouListened?.seed.id).toBe('recent');
  expect(state().becauseYouListened?.tracks.map((t) => t.id)).toEqual(['recent-r1', 'recent-r2']);
  expect(state()).toMatchObject({ isLoading: false, loadFailed: false });
  expect(state().getMix('mix-a')?.tracks[0].id).toBe('a');
});

it('uses favourites and recents as seeds before there is any history', async () => {
  mockState.favorites = [track('fav', 'Fela Kuti')];

  await state().refresh();

  expect(state().mixes.map((m) => m.title)).toEqual(['Fela Kuti Mix']);
});

it('leaves out a section whose radio fails, and keeps the rest', async () => {
  mockState.stats = { a: played(track('a'), 9), b: played(track('b'), 5) };
  mockState.radio = async (id) => {
    if (id === 'a') throw new Error('radio unavailable');
    return radioFor(id);
  };

  await state().refresh();

  expect(state().mixes.map((m) => m.id)).toEqual(['mix-b']);
  expect(state().loadFailed).toBe(false);
});

it('keeps what is on screen when everything fails (e.g. offline)', async () => {
  mockState.stats = { a: played(track('a'), 9) };
  await state().refresh();
  const before = state().mixes;

  mockState.radio = async () => {
    throw new Error('offline');
  };
  await state().refresh({ force: true });

  expect(state().mixes).toBe(before);
  expect(state()).toMatchObject({ isLoading: false, loadFailed: true });
});

it('has nothing to recommend, and stays stale, with no listening at all', async () => {
  const radio = jest.fn(async () => []);
  mockState.radio = radio;

  await state().refresh();

  expect(radio).not.toHaveBeenCalled();
  expect(state()).toMatchObject({ quickPicks: [], mixes: [], lastUpdated: null });
});

it('refreshIfStale only reloads when the recommendations are old', async () => {
  mockState.stats = { a: played(track('a'), 9) };
  const radio = jest.fn(async (id: string) => radioFor(id));
  mockState.radio = radio;

  await state().refreshIfStale();
  await state().refreshIfStale();
  expect(radio).toHaveBeenCalledTimes(1);

  useHomeStore.setState({ lastUpdated: Date.now() - 31 * 60 * 1000 });
  await state().refreshIfStale();
  expect(radio).toHaveBeenCalledTimes(2);
});

it('passes forceRefresh through on pull-to-refresh', async () => {
  mockState.stats = { a: played(track('a'), 9) };
  const radio = jest.fn(async (id: string, _options?: { forceRefresh?: boolean }) => radioFor(id));
  mockState.radio = radio;

  await state().refresh({ force: true });

  expect(radio).toHaveBeenCalledWith('a', { forceRefresh: true });
});

it('leaves "not interested" songs out of every section', async () => {
  mockState.stats = { a: played(track('a', 'Adele'), 9), b: played(track('b', 'Burna Boy'), 5) };
  mockState.notInterested = { 'a-r1': Date.now(), b: Date.now() };

  await state().refresh();

  expect(state().mixes.map((m) => m.id)).toEqual(['mix-a']);
  expect(state().mixes[0].tracks.map((t) => t.id)).toEqual(['a', 'a-r2']);
  expect(state().quickPicks.map((t) => t.id)).toEqual(['a-r2']);
});

it('removeTrack takes a song off the screen without a reload', async () => {
  mockState.stats = {
    a: played(track('a', 'Adele'), 9),
    b: played(track('b', 'Burna Boy'), 5),
    recent: played(track('recent', 'Zara Larsson'), 1, 1),
  };
  await state().refresh();

  state().removeTrack('a-r1');
  expect(state().quickPicks.map((t) => t.id)).not.toContain('a-r1');
  expect(state().getMix('mix-a')?.tracks.map((t) => t.id)).toEqual(['a', 'a-r2']);

  // A mix or "because you listened" row can't outlive the song it is built on
  state().removeTrack('b');
  state().removeTrack('recent');
  expect(state().getMix('mix-b')).toBeUndefined();
  expect(state().becauseYouListened).toBeNull();
});

it('an older refresh does not overwrite a newer one', async () => {
  mockState.stats = { a: played(track('a', 'Adele'), 9) };
  let releaseSlow!: () => void;
  mockState.radio = (id) =>
    new Promise((resolve) => {
      releaseSlow = () => resolve(radioFor(id));
    });
  const slow = state().refresh();

  mockState.stats = { b: played(track('b', 'Burna Boy'), 9) };
  mockState.radio = async (id) => radioFor(id);
  await state().refresh();
  releaseSlow();
  await slow;

  expect(state().mixes.map((m) => m.title)).toEqual(['Burna Boy Mix']);
});
