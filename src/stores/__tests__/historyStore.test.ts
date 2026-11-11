import { Track } from '../../types';

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import { useHistoryStore, MAX_HISTORY_TRACKS } from '../historyStore';

const state = () => useHistoryStore.getState();
const track = (id: string): Track => ({
  id,
  title: id,
  artist: 'A',
  duration: 100,
  thumbnailUrl: 'https://img',
});

beforeEach(() => {
  state().clearHistory();
});

it('counts plays and remembers the first and last time', () => {
  state().recordPlay(track('a'), 1000);
  state().recordPlay(track('a'), 5000);

  expect(state().stats.a).toMatchObject({
    playCount: 2,
    skipCount: 0,
    firstPlayedAt: 1000,
    lastPlayedAt: 5000,
  });
});

it('counts skips without marking the track as recently played', () => {
  state().recordPlay(track('a'), 1000);
  state().recordSkip(track('a'), 9000);
  state().recordSkip(track('new'), 9000);

  expect(state().stats.a).toMatchObject({ playCount: 1, skipCount: 1, lastPlayedAt: 1000 });
  expect(state().stats.new).toMatchObject({ playCount: 0, skipCount: 1 });
});

it('stores metadata only, never local file paths', () => {
  state().recordPlay({
    ...track('a'),
    localFilePath: 'file:///old-container/a.m4a',
    localThumbnailPath: 'file:///old-container/a.jpg',
  });

  expect(state().stats.a.track).toEqual(track('a'));
});

it('evicts the least recently played tracks when full', () => {
  for (let i = 0; i < MAX_HISTORY_TRACKS + 5; i++) {
    state().recordPlay(track(`t${i}`), 1000 + i);
  }

  const ids = Object.keys(state().stats);
  expect(ids).toHaveLength(MAX_HISTORY_TRACKS);
  expect(ids).not.toContain('t0');
  expect(ids).not.toContain('t4');
  expect(ids).toContain('t5');
  expect(ids).toContain(`t${MAX_HISTORY_TRACKS + 4}`);
});
