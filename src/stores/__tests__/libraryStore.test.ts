import { Track } from '../../types';

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
jest.mock('../../services/downloadManager', () => ({
  withCurrentLocalPaths: (t: unknown) => t,
}));

import { useLibraryStore } from '../libraryStore';

const state = () => useLibraryStore.getState();
const track = (id: string): Track => ({
  id,
  title: id,
  artist: 'A',
  duration: 100,
  thumbnailUrl: `https://img/${id}`,
});

beforeEach(() => {
  useLibraryStore.setState({ favorites: [], playlists: [], downloadedTracks: [] });
});

it('imports a playlist with its tracks in order, without duplicates', () => {
  const playlist = state().importPlaylist('Workout', [track('a'), track('b'), track('a'), track('c')]);

  expect(state().playlists).toEqual([playlist]);
  expect(playlist.name).toBe('Workout');
  expect(playlist.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  // Falls back to the first track's artwork
  expect(playlist.coverUrl).toBe('https://img/a');
});

it('keeps the cover an imported album or playlist came with', () => {
  const playlist = state().importPlaylist('21', [track('a')], 'https://img/album');

  expect(playlist.coverUrl).toBe('https://img/album');
});

it('records when a song was liked, newest first', () => {
  const before = Date.now();
  state().toggleFavorite(track('a'));
  state().toggleFavorite(track('b'));

  expect(state().favorites.map((t) => t.id)).toEqual(['b', 'a']);
  expect(state().favorites[0].addedAt).toBeGreaterThanOrEqual(before);

  state().toggleFavorite(track('b'));
  expect(state().favorites.map((t) => t.id)).toEqual(['a']);
});
