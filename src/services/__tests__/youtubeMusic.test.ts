const mockKv: Record<string, any> = {};

jest.mock('../storage', () => ({
  mmkvStorage: {
    getObject: (key: string) => mockKv[key],
    setObject: (key: string, value: unknown) => {
      mockKv[key] = value;
    },
    delete: (key: string) => {
      delete mockKv[key];
    },
    getAllKeys: () => Object.keys(mockKv),
  },
}));

import {
  parseRadioResponse,
  getRadioTracks,
  pruneRadioCache,
  RADIO_CACHE_TTL,
} from '../youtubeMusic';

// Same shape as a real music.youtube.com `next` response, trimmed to the used fields
const panelVideo = (videoId: string, title: string, artists: string[], length: string) => ({
  playlistPanelVideoRenderer: {
    videoId,
    title: { runs: [{ text: title }] },
    shortBylineText: { runs: artists.map((text) => ({ text })) },
    longBylineText: { runs: [{ text: artists.join('') }, { text: ' • ' }, { text: '3.2B views' }] },
    lengthText: { runs: [{ text: length }] },
    thumbnail: {
      thumbnails: [
        { url: `https://i.ytimg.com/vi/${videoId}/small.jpg`, width: 400, height: 225 },
        { url: `https://i.ytimg.com/vi/${videoId}/large.jpg`, width: 853, height: 479 },
      ],
    },
  },
});

const radioResponse = (contents: unknown[]) => ({
  contents: {
    singleColumnMusicWatchNextResultsRenderer: {
      tabbedRenderer: {
        watchNextTabbedResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents } } } },
              },
            },
          ],
        },
      },
    },
  },
});

const sampleResponse = radioResponse([
  panelVideo('seed0000001', 'Despacito', ['Luis Fonsi', ' & ', 'Daddy Yankee'], '4:42'),
  panelVideo('rel00000001', 'Con Calma (feat. Snow)', ['Daddy Yankee'], '3:31'),
  { automixPreviewVideoRenderer: {} },
  panelVideo('rel00000001', 'Duplicate', ['Daddy Yankee'], '3:31'),
  panelVideo('long0000001', 'Long Set', ['DJ'], '1:02:03'),
]);

const mockFetchOk = (body: unknown) =>
  jest.fn(async () => ({ ok: true, status: 200, json: async () => body })) as any;

beforeEach(() => {
  for (const key of Object.keys(mockKv)) delete mockKv[key];
});

describe('parseRadioResponse', () => {
  it('maps radio items to tracks, skipping unknown items and duplicates', () => {
    expect(parseRadioResponse(sampleResponse)).toEqual([
      {
        id: 'seed0000001',
        title: 'Despacito',
        artist: 'Luis Fonsi & Daddy Yankee',
        duration: 282,
        thumbnailUrl: 'https://i.ytimg.com/vi/seed0000001/large.jpg',
      },
      {
        id: 'rel00000001',
        title: 'Con Calma (feat. Snow)',
        artist: 'Daddy Yankee',
        duration: 211,
        thumbnailUrl: 'https://i.ytimg.com/vi/rel00000001/large.jpg',
      },
      {
        id: 'long0000001',
        title: 'Long Set',
        artist: 'DJ',
        duration: 3723,
        thumbnailUrl: 'https://i.ytimg.com/vi/long0000001/large.jpg',
      },
    ]);
  });

  it('returns an empty list when YouTube changes the response shape', () => {
    expect(parseRadioResponse({})).toEqual([]);
    expect(parseRadioResponse(null)).toEqual([]);
    expect(parseRadioResponse({ contents: { somethingElse: [] } })).toEqual([]);
  });
});

describe('getRadioTracks', () => {
  it('asks YouTube Music for the song radio and caches the result', async () => {
    global.fetch = mockFetchOk(sampleResponse);

    const first = await getRadioTracks('seed0000001');
    const second = await getRadioTracks('seed0000001');

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({ videoId: 'seed0000001', playlistId: 'RDAMVMseed0000001' });
  });

  it('re-fetches when forced or when the cache has expired', async () => {
    global.fetch = mockFetchOk(sampleResponse);
    await getRadioTracks('seed0000001');

    await getRadioTracks('seed0000001', { forceRefresh: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    mockKv['radio_v1_seed0000001'].timestamp = Date.now() - RADIO_CACHE_TTL - 1;
    await getRadioTracks('seed0000001');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('shares one request between simultaneous callers', async () => {
    global.fetch = mockFetchOk(sampleResponse);

    await Promise.all([getRadioTracks('seed0000001'), getRadioTracks('seed0000001')]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects, and caches nothing, on HTTP errors and empty radios', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })) as any;
    await expect(getRadioTracks('a')).rejects.toThrow('403');

    global.fetch = mockFetchOk({});
    await expect(getRadioTracks('b')).rejects.toThrow('no tracks');

    expect(Object.keys(mockKv)).toEqual([]);
  });
});

describe('pruneRadioCache', () => {
  it('removes expired and old-version radios only', () => {
    const now = Date.now();
    mockKv['radio_v1_fresh'] = { tracks: [], timestamp: now };
    mockKv['radio_v1_expired'] = { tracks: [], timestamp: now - RADIO_CACHE_TTL - 1 };
    mockKv['radio_v0_old'] = { tracks: [], timestamp: now };
    mockKv['history-store'] = '{}';

    expect(pruneRadioCache()).toBe(2);
    expect(Object.keys(mockKv).sort()).toEqual(['history-store', 'radio_v1_fresh']);
  });
});
