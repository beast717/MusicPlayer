import { Track } from '../../types';

const track = (id: string): Track => ({
  id,
  title: `Song ${id}`,
  artist: 'Artist',
  duration: 200,
  thumbnailUrl: 'https://img',
});

type NetState = { isConnected: boolean; type: string };

const mockEnv = {
  blockReason: null as string | null,
  netListener: null as ((state: NetState) => void) | null,
  downloads: [] as string[],
  failing: new Set<string>(),
};

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (listener: (state: NetState) => void) => {
      mockEnv.netListener = listener;
      return () => {
        mockEnv.netListener = null;
      };
    },
  },
}));
jest.mock('../storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));
jest.mock('../downloadManager', () => ({
  getDownloadBlockReason: async () => mockEnv.blockReason,
  withCurrentLocalPaths: (t: unknown) => t,
}));
jest.mock('../../stores/downloadStore', () => {
  const { useLibraryStore } = require('../../stores/libraryStore');
  return {
    useDownloadStore: {
      getState: () => ({
        activeDownloads: {},
        startDownload: async (t: { id: string }) => {
          mockEnv.downloads.push(t.id);
          await Promise.resolve();
          if (!mockEnv.failing.has(t.id)) useLibraryStore.getState().addDownloadedTrack(t);
        },
      }),
    },
  };
});

import { startAutoDownload, syncFavoriteDownloads } from '../autoDownload';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const online = (type = 'wifi') => mockEnv.netListener?.({ isConnected: true, type });
const like = (t: Track) => useLibraryStore.getState().toggleFavorite(t);

let stop: () => void;

beforeEach(() => {
  mockEnv.blockReason = null;
  mockEnv.downloads = [];
  mockEnv.failing = new Set();
  useLibraryStore.setState({ favorites: [], downloadedTracks: [], playlists: [] });
  useSettingsStore.setState({ autoDownloadFavorites: false, downloadOverWifiOnly: true });
  stop = startAutoDownload();
});

afterEach(() => {
  stop();
});

it('does nothing while the setting is off', async () => {
  like(track('a'));
  online();
  await settle();

  expect(mockEnv.downloads).toEqual([]);
});

it('downloads the liked songs that are missing when the setting is turned on', async () => {
  like(track('a'));
  like(track('b'));
  useLibraryStore.getState().addDownloadedTrack(track('a'));

  useSettingsStore.getState().setAutoDownloadFavorites(true);
  await settle();

  expect(mockEnv.downloads).toEqual(['b']);
});

it('downloads a song as soon as it is liked, but not when one is unliked', async () => {
  useSettingsStore.getState().setAutoDownloadFavorites(true);
  await settle();

  like(track('a'));
  await settle();
  expect(mockEnv.downloads).toEqual(['a']);

  like(track('a'));
  await settle();
  expect(mockEnv.downloads).toEqual(['a']);
});

it('waits for a usable connection instead of failing every song', async () => {
  mockEnv.blockReason = 'Downloads are set to Wi-Fi only.';
  useSettingsStore.getState().setAutoDownloadFavorites(true);
  like(track('a'));
  like(track('b'));
  await settle();
  expect(mockEnv.downloads).toEqual([]);

  mockEnv.blockReason = null;
  online('wifi');
  await settle();
  expect(mockEnv.downloads.sort()).toEqual(['a', 'b']);
});

it('does not retry a failed song in a loop, only on a new connection', async () => {
  mockEnv.failing.add('a');
  useSettingsStore.getState().setAutoDownloadFavorites(true);
  online('wifi');
  like(track('a'));
  await settle();
  expect(mockEnv.downloads).toEqual(['a']);

  await syncFavoriteDownloads();
  online('wifi'); // repeated event for the same connection
  await settle();
  expect(mockEnv.downloads).toEqual(['a']);

  online('cellular');
  await settle();
  expect(mockEnv.downloads).toEqual(['a', 'a']);
});

it('picks up songs liked while a sync is running', async () => {
  useSettingsStore.getState().setAutoDownloadFavorites(true);
  await settle();

  like(track('a'));
  like(track('b'));
  like(track('c'));
  await settle();

  expect(mockEnv.downloads.sort()).toEqual(['a', 'b', 'c']);
});

it('stops when the setting is turned off mid-way', async () => {
  like(track('a'));
  like(track('b'));
  useSettingsStore.getState().setAutoDownloadFavorites(true);
  useSettingsStore.getState().setAutoDownloadFavorites(false);
  await settle();

  expect(mockEnv.downloads.length).toBeLessThan(2);
});
