import { AudioStream } from '../../types';

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

jest.mock('../StreamExtractorWebView', () => ({
  extractStreamsViaWebView: async () => {
    throw new Error('WebView unavailable in tests');
  },
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ audioQuality: 'high' }) },
}));

import {
  pickBestAudioStream,
  getAudioPlaybackSource,
  invalidateStreamCache,
  pruneStreamCache,
} from '../youtube';

const stream = (
  mimeType: string,
  bitrate: number,
  streamType: AudioStream['streamType'] = 'default'
): AudioStream => ({ url: `${mimeType}@${bitrate}`, mimeType, bitrate, quality: '', codec: '', streamType });

const hls = stream('application/x-mpegURL', 0, 'hls');
const mixed = [
  stream('audio/webm', 160000),
  stream('audio/mp4', 48000),
  stream('audio/mp4', 130000),
  stream('audio/webm', 50000),
  hls,
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  for (const key of Object.keys(mockKv)) delete mockKv[key];
});

describe('pickBestAudioStream', () => {
  it.each([
    ['low', 'audio/mp4@48000'],
    ['medium', 'audio/mp4@130000'],
    ['high', 'audio/mp4@130000'],
  ] as const)('downloads (mp4 only) with %s quality → %s', (quality, expected) => {
    expect(pickBestAudioStream(mixed, quality, false, true)?.url).toBe(expected);
  });

  it('never returns webm or HLS for downloads', () => {
    expect(pickBestAudioStream([stream('audio/webm', 160000), hls], 'high', false, true)).toBeNull();
  });

  it('prefers HLS for playback when available', () => {
    expect(pickBestAudioStream(mixed, 'low', true)?.streamType).toBe('hls');
  });

  it('falls back to webm by quality when nothing else exists', () => {
    const webmOnly = [stream('audio/webm', 50000), stream('audio/webm', 160000)];
    expect(pickBestAudioStream(webmOnly, 'high', false)?.bitrate).toBe(160000);
    expect(pickBestAudioStream(webmOnly, 'low', false)?.bitrate).toBe(50000);
  });
});

describe('stream resolution cache', () => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  beforeEach(() => {
    // InnerTube answers first with HLS; Piped and Invidious answer later with mp4
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('youtubei/v1/player')) {
        return json({
          playabilityStatus: { status: 'OK' },
          streamingData: { hlsManifestUrl: 'https://hls/winner', adaptiveFormats: [] },
        });
      }
      if (url.includes('/streams/')) {
        await wait(30);
        return json({ audioStreams: [{ url: 'https://piped/loser', mimeType: 'audio/mp4', bitrate: 128000 }] });
      }
      if (url.includes('/api/v1/videos/')) {
        await wait(50);
        return json({ adaptiveFormats: [{ url: 'https://invidious/loser', type: 'audio/mp4', bitrate: '128000' }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as any;
  });

  it('caches only the winning source, even after slower sources finish', async () => {
    const source = await getAudioPlaybackSource('vid1');
    await wait(100); // let the losing sources complete

    const keys = Object.keys(mockKv).filter((k) => k.includes('vid1'));
    expect(source.url).toBe('https://hls/winner');
    expect(keys).toHaveLength(1);
    expect(mockKv[keys[0]].url).toBe('https://hls/winner');
  });

  it('invalidateStreamCache clears every mode and quality', async () => {
    await getAudioPlaybackSource('vid1', 'low');
    await getAudioPlaybackSource('vid1', 'high');
    await wait(100);

    invalidateStreamCache('vid1');

    expect(Object.keys(mockKv).filter((k) => k.includes('vid1'))).toEqual([]);
  });
});

describe('pruneStreamCache', () => {
  it('removes expired, old-version and broken entries and keeps the rest', () => {
    const now = Date.now();
    mockKv['stream_v4_playback_abc'] = { url: 'x', timestamp: now };
    mockKv['stream_v5_playback_high_expired'] = { url: 'x', timestamp: now - 46 * 60 * 1000 };
    mockKv['stream_v5_direct_low_broken'] = undefined;
    mockKv['stream_v5_playback_high_fresh'] = { url: 'x', timestamp: now };
    mockKv['library-store'] = '{}';

    expect(pruneStreamCache()).toBe(3);
    expect(Object.keys(mockKv).sort()).toEqual(['library-store', 'stream_v5_playback_high_fresh']);
  });
});
