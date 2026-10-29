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

const mockExtractStreams = jest.fn();
const mockResetSession = jest.fn();

jest.mock('../StreamExtractorWebView', () => ({
  extractStreamsViaWebView: (...args: unknown[]) => mockExtractStreams(...args),
  resetWebViewSession: () => mockResetSession(),
}));

jest.mock('../../stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ audioQuality: 'high' }) },
}));

import {
  pickBestAudioStream,
  getAudioPlaybackSource,
  getAudioDownloadSource,
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

describe('stream resolution', () => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const status = (code: number) => ({ ok: code >= 200 && code < 300, status: code });

  const webViewStream = {
    url: 'https://gvs/webview-m4a',
    mimeType: 'audio/mp4',
    bitrate: 130000,
    quality: 'AUDIO_QUALITY_MEDIUM',
    contentLength: 5000000,
  };

  /** Range requests to stream URLs answer with these codes; other URLs hit InnerTube. */
  let probeStatus: Record<string, number>;
  let innerTubeStreamingData: unknown;

  beforeEach(() => {
    mockExtractStreams.mockReset();
    mockResetSession.mockReset();
    probeStatus = {};
    innerTubeStreamingData = {
      hlsManifestUrl: 'https://hls/innertube',
      adaptiveFormats: [],
    };

    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('youtubei/v1/player')) {
        return json({ playabilityStatus: { status: 'OK' }, streamingData: innerTubeStreamingData });
      }
      if (url in probeStatus) return status(probeStatus[url]);
      throw new Error(`unexpected fetch ${url}`);
    }) as any;
  });

  it('plays the PoToken stream from the WebView after probing its last byte', async () => {
    mockExtractStreams.mockResolvedValue([webViewStream]);
    probeStatus[webViewStream.url] = 206;

    const source = await getAudioPlaybackSource('vid1');

    expect(source.url).toBe(webViewStream.url);
    expect(mockExtractStreams).toHaveBeenCalledWith('vid1', 'TV_SIMPLY');
    expect(global.fetch).toHaveBeenCalledWith(
      webViewStream.url,
      expect.objectContaining({ headers: { Range: 'bytes=4999999-4999999' } })
    );
    expect(mockResetSession).not.toHaveBeenCalled();
  });

  it('caches the resolved stream', async () => {
    mockExtractStreams.mockResolvedValue([webViewStream]);
    probeStatus[webViewStream.url] = 206;

    await getAudioPlaybackSource('vid1');
    await getAudioPlaybackSource('vid1');

    expect(mockExtractStreams).toHaveBeenCalledTimes(1);
    const keys = Object.keys(mockKv).filter((k) => k.includes('vid1'));
    expect(keys).toHaveLength(1);
    expect(mockKv[keys[0]].url).toBe(webViewStream.url);
  });

  it('shares one resolution between simultaneous requests for a song', async () => {
    mockExtractStreams.mockResolvedValue([webViewStream]);
    probeStatus[webViewStream.url] = 206;

    const [a, b] = await Promise.all([getAudioPlaybackSource('vid1'), getAudioPlaybackSource('vid1')]);

    expect(a.url).toBe(webViewStream.url);
    expect(b.url).toBe(webViewStream.url);
    expect(mockExtractStreams).toHaveBeenCalledTimes(1);
  });

  it('keeps a stream cached until its own expiry, past the default lifetime', async () => {
    const expiresIn = (hours: number) => Math.floor(Date.now() / 1000) + hours * 3600;
    const longLived = { ...webViewStream, url: `https://gvs/long?expire=${expiresIn(6)}&x=1` };
    mockExtractStreams.mockResolvedValue([longLived]);
    probeStatus[longLived.url] = 206;
    await getAudioPlaybackSource('vid1');

    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 60 * 60 * 1000; // two hours later
    try {
      expect((await getAudioPlaybackSource('vid1')).url).toBe(longLived.url);
      expect(mockExtractStreams).toHaveBeenCalledTimes(1);

      Date.now = () => realNow() + 5.75 * 60 * 60 * 1000; // inside the 30 min safety margin
      await getAudioPlaybackSource('vid1');
      expect(mockExtractStreams).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('retries with a fresh session when YouTube rejects the token', async () => {
    const freshStream = { ...webViewStream, url: 'https://gvs/fresh-session' };
    mockExtractStreams.mockResolvedValueOnce([webViewStream]).mockResolvedValueOnce([freshStream]);
    probeStatus[webViewStream.url] = 403;
    probeStatus[freshStream.url] = 206;

    const source = await getAudioPlaybackSource('vid1');

    expect(source.url).toBe(freshStream.url);
    expect(mockExtractStreams).toHaveBeenCalledTimes(2);
    expect(mockResetSession).toHaveBeenCalledTimes(1);
  });

  it('falls back after a fresh session is rejected too', async () => {
    mockExtractStreams.mockResolvedValue([webViewStream]);
    probeStatus[webViewStream.url] = 403;

    const source = await getAudioPlaybackSource('vid1');

    expect(mockExtractStreams.mock.calls.map((call) => call[1])).toEqual(['TV_SIMPLY', 'TV_SIMPLY']);
    // Each rejected session is dropped, so the next song starts with a fresh one
    expect(mockResetSession).toHaveBeenCalledTimes(2);
    expect(source.url).toBe('https://hls/innertube');
  });

  it('keeps the WebView session when the video itself is unavailable', async () => {
    mockExtractStreams.mockRejectedValue(new Error('TV_SIMPLY: ERROR This video is unavailable'));

    await getAudioPlaybackSource('vid1');

    expect(mockExtractStreams).toHaveBeenCalledTimes(1);
    expect(mockResetSession).not.toHaveBeenCalled();
  });

  it('rejects fallback streams that stop after the first megabyte', async () => {
    mockExtractStreams.mockRejectedValue(new Error('WebView unavailable'));
    innerTubeStreamingData = {
      adaptiveFormats: [
        { url: 'https://gvs/ios-m4a', mimeType: 'audio/mp4', bitrate: 130000, contentLength: '5000000' },
      ],
    };
    probeStatus['https://gvs/ios-m4a'] = 403;

    await expect(getAudioPlaybackSource('vid1')).rejects.toThrow(/InnerTube: stream blocked \(HTTP 403\)/);
    expect(Object.keys(mockKv).filter((k) => k.includes('vid1'))).toEqual([]);
  });

  it('accepts a 416 probe when the stream size is unknown (file shorter than the probe)', async () => {
    mockExtractStreams.mockResolvedValue([{ ...webViewStream, contentLength: 0 }]);
    probeStatus[webViewStream.url] = 416;

    const source = await getAudioPlaybackSource('vid1');

    expect(source.url).toBe(webViewStream.url);
  });

  it('downloads only accept mp4 streams', async () => {
    const webm = { ...webViewStream, url: 'https://gvs/webm', mimeType: 'audio/webm', bitrate: 160000 };
    mockExtractStreams.mockResolvedValue([webm, webViewStream]);
    probeStatus[webViewStream.url] = 206;

    expect((await getAudioDownloadSource('vid1')).url).toBe(webViewStream.url);
  });

  it('invalidateStreamCache clears every mode and quality', async () => {
    mockExtractStreams.mockResolvedValue([webViewStream]);
    probeStatus[webViewStream.url] = 206;
    await getAudioPlaybackSource('vid1', 'low');
    await getAudioPlaybackSource('vid1', 'high');
    await getAudioDownloadSource('vid1', 'high');

    invalidateStreamCache('vid1');

    expect(Object.keys(mockKv).filter((k) => k.includes('vid1'))).toEqual([]);
  });
});

describe('pruneStreamCache', () => {
  it('removes expired, old-version and broken entries and keeps the rest', () => {
    const now = Date.now();
    mockKv['stream_v6_playback_high_abc'] = { url: 'x', timestamp: now };
    mockKv['stream_v7_playback_high_expired'] = { url: 'x', timestamp: now - 46 * 60 * 1000 };
    mockKv['stream_v7_direct_low_broken'] = undefined;
    mockKv['stream_v7_playback_high_fresh'] = { url: 'x', timestamp: now };
    mockKv['library-store'] = '{}';

    expect(pruneStreamCache()).toBe(3);
    expect(Object.keys(mockKv).sort()).toEqual(['library-store', 'stream_v7_playback_high_fresh']);
  });
});
