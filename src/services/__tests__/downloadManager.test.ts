let mockNetState: { isConnected: boolean | null; type: string };

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///current-container/Documents/',
  cacheDirectory: 'file:///current-container/Caches/',
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => mockNetState },
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    ethernet: 'ethernet',
  },
}));

jest.mock('../youtube', () => ({ getAudioDownloadSource: jest.fn() }));
jest.mock('../streamProxy', () => ({ getProxiedStreamUrl: jest.fn() }));

import { getDownloadBlockReason, withCurrentLocalPaths } from '../downloadManager';

describe('getDownloadBlockReason', () => {
  it.each([
    [{ isConnected: true, type: 'wifi' }, true, null],
    [{ isConnected: true, type: 'ethernet' }, true, null],
    [{ isConnected: true, type: 'cellular' }, false, null],
    [{ isConnected: false, type: 'none' }, false, 'No internet connection.'],
  ])('%j with wifiOnly=%s → %s', async (net, wifiOnly, expected) => {
    mockNetState = net;
    expect(await getDownloadBlockReason(wifiOnly)).toBe(expected);
  });

  it.each(['cellular', 'unknown'])('blocks %s when Wi-Fi only is on', async (type) => {
    mockNetState = { isConnected: true, type };
    expect(await getDownloadBlockReason(true)).toMatch(/Wi-Fi only/);
  });
});

describe('withCurrentLocalPaths', () => {
  it('rebuilds stale paths from a previous app container', () => {
    const track = withCurrentLocalPaths({
      id: 'abc',
      title: '',
      artist: '',
      duration: 0,
      thumbnailUrl: 'https://img',
      localFilePath: 'file:///old-container/Documents/downloads/abc.m4a',
      localThumbnailPath: 'file:///old-container/Documents/thumbnails/abc.jpg',
    });

    expect(track.localFilePath).toBe('file:///current-container/Documents/downloads/abc.m4a');
    expect(track.localThumbnailPath).toBe('file:///current-container/Documents/thumbnails/abc.jpg');
  });

  it('leaves tracks without local files untouched', () => {
    const track = { id: 'abc', title: '', artist: '', duration: 0, thumbnailUrl: 'https://img' };
    expect(withCurrentLocalPaths(track)).toBe(track);
  });
});
