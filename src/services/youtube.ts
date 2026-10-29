import { SearchResult, AudioStream, ResolvedAudioSource } from '../types';
import {
  STREAM_URL_TTL,
  REQUEST_TIMEOUT,
  AudioQuality,
} from '../utils/constants';
import { mmkvStorage } from './storage';
import { useSettingsStore } from '../stores/settingsStore';
import { extractStreamsViaWebView, resetWebViewSession } from './StreamExtractorWebView';

// ─── Helpers ────────────────────────────────────────────────────────

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}

// ─── InnerTube Search (direct to YouTube) ───────────────────────────

const INNERTUBE_SEARCH_URL =
  'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250301.01.00',
    hl: 'en',
    gl: 'US',
  },
};

interface InnerTubeVideoRenderer {
  videoId: string;
  title: { runs: { text: string }[] };
  ownerText?: { runs: { text: string }[] };
  shortBylineText?: { runs: { text: string; navigationEndpoint?: any }[] };
  thumbnail: { thumbnails: { url: string; width: number; height: number }[] };
  lengthText?: { simpleText: string };
  viewCountText?: { simpleText: string };
  publishedTimeText?: { simpleText: string };
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseViewCount(text: string | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
}

function extractVideoRenderers(data: any): InnerTubeVideoRenderer[] {
  const renderers: InnerTubeVideoRenderer[] = [];

  try {
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item.videoRenderer) {
          renderers.push(item.videoRenderer);
        }
      }
    }
  } catch {
    // Structure may vary; return what we have
  }

  return renderers;
}

export async function searchYouTube(
  query: string,
  _filter: string = 'music_songs'
): Promise<SearchResult[]> {
  try {
    const response = await fetchWithTimeout(INNERTUBE_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        query,
      }),
    });

    if (!response.ok) {
      throw new Error(`YouTube search returned ${response.status}`);
    }

    const data = await response.json();
    const renderers = extractVideoRenderers(data);

    return renderers.map((r) => ({
      videoId: r.videoId,
      title: r.title?.runs?.map((t) => t.text).join('') || '',
      uploaderName:
        r.ownerText?.runs?.[0]?.text ||
        r.shortBylineText?.runs?.[0]?.text ||
        '',
      uploaderUrl:
        r.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
          ?.canonicalBaseUrl || '',
      thumbnailUrl:
        r.thumbnail?.thumbnails?.[r.thumbnail.thumbnails.length - 1]?.url || '',
      duration: parseDuration(r.lengthText?.simpleText || ''),
      views: parseViewCount(r.viewCountText?.simpleText),
      uploadedDate: r.publishedTimeText?.simpleText || '',
    }));
  } catch (err: any) {
    console.warn('InnerTube search failed:', err.message);
    throw new Error(
      'Search failed. Please check your internet connection and try again.'
    );
  }
}

// ─── Audio Stream Extraction ────────────────────────────────────────
// YouTube serves only the first ~1 MB of protected songs (label music) unless
// the stream URL carries a BotGuard PoToken. The hidden WebView
// (StreamExtractorWebView) mints one and returns ready-to-play URLs; InnerTube's
// app clients are kept as a fallback for unprotected videos. Every direct
// stream is probed at its last byte before use, so a blocked URL is never
// handed to the player or cached.

interface CachedStreamUrl {
  url: string;
  mimeType: string;
  streamType: 'default' | 'hls';
  timestamp: number;
}

const STREAM_SOURCE_CACHE_VERSION = 'v6';

type AudioResolveMode = 'direct' | 'playback';

const AUDIO_QUALITIES: AudioQuality[] = ['low', 'medium', 'high'];

/** InnerTube client the WebView uses. TV_SIMPLY streams accept the web PoToken. */
const WEBVIEW_CLIENT = 'TV_SIMPLY';

/**
 * YouTube now and then rejects a whole session's token; a fresh session
 * usually fixes it, so try once more right away instead of failing the song.
 */
const WEBVIEW_ATTEMPTS = 2;

interface ResolveAudioOptions {
  allowAdaptiveManifest?: boolean;
  preferHls?: boolean;
  cacheMode: AudioResolveMode;
  /** Only accept mp4/m4a audio (downloads are saved as .m4a, and iOS can't play webm). */
  mp4Only?: boolean;
}

function streamCacheKey(
  videoId: string,
  mode: AudioResolveMode,
  quality: AudioQuality
): string {
  return `stream_${STREAM_SOURCE_CACHE_VERSION}_${mode}_${quality}_${videoId}`;
}

function getCachedAudioSource(
  videoId: string,
  mode: AudioResolveMode,
  quality: AudioQuality
): ResolvedAudioSource | null {
  const cached = mmkvStorage.getObject<CachedStreamUrl>(
    streamCacheKey(videoId, mode, quality)
  );
  if (cached && Date.now() - cached.timestamp < STREAM_URL_TTL) {
    return {
      url: cached.url,
      mimeType: cached.mimeType,
      streamType: cached.streamType,
    };
  }
  return null;
}

function cacheAudioSource(
  videoId: string,
  mode: AudioResolveMode,
  quality: AudioQuality,
  source: ResolvedAudioSource
): void {
  mmkvStorage.setObject<CachedStreamUrl>(
    streamCacheKey(videoId, mode, quality),
    {
    url: source.url,
    mimeType: source.mimeType,
    streamType: source.streamType,
    timestamp: Date.now(),
    }
  );
}

function extractAudioStreamsFromStreamingData(
  streamingData: any,
  options: Pick<ResolveAudioOptions, 'allowAdaptiveManifest'>
): AudioStream[] {
  const { allowAdaptiveManifest = false } = options;
  const adaptiveFormats = streamingData?.adaptiveFormats || [];
  const regularFormats = streamingData?.formats || [];
  const allFormats = [...adaptiveFormats, ...regularFormats];

  const directAudioStreams: AudioStream[] = allFormats
    .filter((f: any) => (f.mimeType || '').startsWith('audio/'))
    .map((f: any): AudioStream => {
      let streamUrl = f.url || '';

      if (!streamUrl && f.signatureCipher) {
        try {
          const params = new URLSearchParams(f.signatureCipher);
          streamUrl = params.get('url') || '';
        } catch {}
      }

      return {
        url: streamUrl,
        mimeType: (f.mimeType || '').split(';')[0],
        bitrate: f.bitrate || 0,
        quality: f.audioQuality || f.quality || '',
        codec: f.mimeType?.match(/codecs="([^"]+)"/)?.[1] || '',
        streamType: 'default',
        contentLength: Number(f.contentLength) || 0,
      };
    })
    .filter((stream) => stream.url !== '');

  const streams = [...directAudioStreams];
  if (allowAdaptiveManifest && streamingData?.hlsManifestUrl) {
    streams.push({
      url: streamingData.hlsManifestUrl,
      mimeType: 'application/x-mpegURL',
      bitrate: 0,
      quality: 'hls',
      codec: 'hls',
      streamType: 'hls',
    });
  }

  return streams;
}

/**
 * Fallback: InnerTube player API with app client identities (no PoToken).
 * Only unprotected videos play in full this way.
 */
interface InnerTubeResult {
  streams: AudioStream[];
  diagnostics: string[];
}

interface InnerTubeClientConfig {
  name: string;
  client: Record<string, string | number>;
  params?: string;
}

async function getStreamFromInnerTube(
  videoId: string,
  allowAdaptiveManifest: boolean
): Promise<InnerTubeResult> {
  const clients: InnerTubeClientConfig[] = [
    {
      name: 'IOS',
      client: {
        clientName: 'IOS',
        clientVersion: '20.10.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.3.1',
      },
    },
    {
      name: 'ANDROID_VR',
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        deviceMake: 'Google',
        deviceModel: 'Pixel 8',
      },
      params: 'CgIQBg',
    },
  ];

  const diagnostics: string[] = [];

  for (const client of clients) {
    try {
      const body: Record<string, any> = {
        context: { client: { ...client.client, hl: 'en', gl: 'US' } },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      };

      if (client.params) {
        body.params = client.params;
      }

      const response = await fetchWithTimeout(
        'https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        15000
      );

      if (!response.ok) {
        diagnostics.push(`${client.name}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const status = data.playabilityStatus?.status;
      const reason = data.playabilityStatus?.reason || '';

      if (status !== 'OK') {
        diagnostics.push(`${client.name}: ${status} ${reason}`.trim());
        continue;
      }

      const adaptiveFormats = data.streamingData?.adaptiveFormats || [];
      const allAudio = adaptiveFormats.filter(
        (f: any) => (f.mimeType || '').startsWith('audio/')
      );
      const withUrl = allAudio.filter((f: any) => f.url);
      const audioStreams = extractAudioStreamsFromStreamingData(
        data.streamingData,
        { allowAdaptiveManifest }
      );

      if (audioStreams.length > 0) {
        return { streams: audioStreams, diagnostics };
      }

      const hasSABR = !!data.streamingData?.serverAbrStreamingUrl;
      const hasHls = !!data.streamingData?.hlsManifestUrl;
      diagnostics.push(
        `${client.name}: OK but audio=${allAudio.length} withUrl=${withUrl.length} adaptive=${adaptiveFormats.length} hls=${hasHls} sabr=${hasSABR}`
      );
    } catch (err: any) {
      diagnostics.push(`${client.name}: ${err.message}`);
      continue;
    }
  }

  return { streams: [], diagnostics };
}

function toResolvedAudioSource(stream: AudioStream): ResolvedAudioSource {
  return {
    url: stream.url,
    mimeType: stream.mimeType,
    streamType: stream.streamType,
  };
}

// Used when a stream's size is unknown: past the ~1 MB YouTube serves
// without a valid PoToken.
const PROBE_OFFSET_WITHOUT_LENGTH = 2_000_000;

class StreamRejectedError extends Error {}

/**
 * Throws unless the whole stream is fetchable. YouTube answers the start of a
 * protected stream even without a PoToken, so the probe reads the last byte.
 */
async function verifyFullStreamAccess(stream: AudioStream): Promise<void> {
  if (stream.streamType === 'hls') return;

  const offset = stream.contentLength
    ? stream.contentLength - 1
    : PROBE_OFFSET_WITHOUT_LENGTH;
  const response = await fetchWithTimeout(
    stream.url,
    { headers: { Range: `bytes=${offset}-${offset}` } },
    5000
  );

  // 416 without a known size: the file ends before the probe offset, so all of it is servable
  if (response.ok || (response.status === 416 && !stream.contentLength)) return;
  throw new StreamRejectedError(`stream blocked (HTTP ${response.status})`);
}

/**
 * Invalidate the cached stream URL for a video so the next resolve
 * will re-fetch from the server.  Called after a playback error.
 */
export function invalidateStreamCache(videoId: string): void {
  const modes: AudioResolveMode[] = ['direct', 'playback'];
  for (const mode of modes) {
    for (const quality of AUDIO_QUALITIES) {
      mmkvStorage.delete(streamCacheKey(videoId, mode, quality));
    }
  }
}

/**
 * Remove expired stream URLs and entries from older cache versions.
 * Stream URLs are cached per video, so without this MMKV grows forever.
 */
export function pruneStreamCache(): number {
  const currentPrefix = `stream_${STREAM_SOURCE_CACHE_VERSION}_`;
  const now = Date.now();
  let removed = 0;

  for (const key of mmkvStorage.getAllKeys()) {
    if (!key.startsWith('stream_')) continue;

    const cached = key.startsWith(currentPrefix)
      ? mmkvStorage.getObject<CachedStreamUrl>(key)
      : undefined;
    if (!cached || !cached.timestamp || now - cached.timestamp >= STREAM_URL_TTL) {
      mmkvStorage.delete(key);
      removed++;
    }
  }

  return removed;
}

async function resolveAudioSource(
  videoId: string,
  quality: AudioQuality,
  options: ResolveAudioOptions
): Promise<ResolvedAudioSource> {
  const {
    allowAdaptiveManifest = false,
    preferHls = false,
    cacheMode,
    mp4Only = false,
  } = options;

  const cached = getCachedAudioSource(videoId, cacheMode, quality);
  if (cached) return cached;

  const errors: string[] = [];
  let webViewStreamRejected = false;

  // Attempt a stream source, returning null on failure
  const trySource = async (
    name: string,
    fn: () => Promise<AudioStream[]>,
    usePreferHls = false
  ): Promise<ResolvedAudioSource | null> => {
    try {
      const streams = await fn();
      const stream = pickBestAudioStream(streams, quality, usePreferHls, mp4Only);
      if (!stream) {
        errors.push(
          `${name}: no suitable ${mp4Only ? 'mp4 ' : ''}audio stream found`
        );
        return null;
      }

      await verifyFullStreamAccess(stream);
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, quality, source);
      return source;
    } catch (err: any) {
      if (err instanceof StreamRejectedError && name.startsWith('WebView')) {
        webViewStreamRejected = true;
      }
      errors.push(`${name}: ${err.message}`);
      return null;
    }
  };

  // 1. WebView: PoToken-authorized streams, needed for protected songs
  for (let attempt = 1; attempt <= WEBVIEW_ATTEMPTS; attempt++) {
    webViewStreamRejected = false;
    const source = await trySource(`WebView (attempt ${attempt})`, async () =>
      (await extractStreamsViaWebView(videoId, WEBVIEW_CLIENT)).map((stream) => ({
        ...stream,
        codec: '',
        streamType: 'default' as const,
      }))
    );
    if (source) return source;

    // Other failures (video unavailable, timeout) won't change with a new token
    if (!webViewStreamRejected) break;
    resetWebViewSession();
  }

  // 2. InnerTube app clients: only unprotected videos play in full
  const innerTubeSource = await trySource(
    'InnerTube',
    async () => {
      const result = await getStreamFromInnerTube(videoId, allowAdaptiveManifest);
      if (result.streams.length === 0 && result.diagnostics.length > 0) {
        throw new Error(result.diagnostics.join('; '));
      }
      return result.streams;
    },
    preferHls
  );
  if (innerTubeSource) return innerTubeSource;

  console.warn('All stream methods failed:', errors);
  throw new Error(
    `${mp4Only ? 'No downloadable (M4A) audio stream was found for this song.' : 'Could not get audio stream.'}\n${errors.join('\n')}`
  );
}

export async function getAudioPlaybackSource(
  videoId: string,
  quality: AudioQuality = useSettingsStore.getState().audioQuality
): Promise<ResolvedAudioSource> {
  return resolveAudioSource(videoId, quality, {
    allowAdaptiveManifest: true,
    // For the InnerTube fallback: AVPlayer handles HLS natively and those
    // manifests play in full where they are offered.
    preferHls: true,
    cacheMode: 'playback',
  });
}

export async function getAudioStreamUrl(
  videoId: string,
  quality: AudioQuality = useSettingsStore.getState().audioQuality
): Promise<string> {
  const source = await resolveAudioSource(videoId, quality, {
    allowAdaptiveManifest: false,
    preferHls: false,
    cacheMode: 'direct',
    mp4Only: true,
  });
  return source.url;
}

const MEDIUM_TARGET_BITRATE = 128000;

/** low = smallest stream, high = best available, medium = closest to ~128 kbps. */
function pickByQuality(
  streams: AudioStream[],
  quality: AudioQuality
): AudioStream | null {
  if (streams.length === 0) return null;
  const byBitrate = [...streams].sort((a, b) => a.bitrate - b.bitrate);

  if (quality === 'low') return byBitrate[0];
  if (quality === 'high') return byBitrate[byBitrate.length - 1];

  return byBitrate.reduce((best, s) =>
    Math.abs(s.bitrate - MEDIUM_TARGET_BITRATE) <
    Math.abs(best.bitrate - MEDIUM_TARGET_BITRATE)
      ? s
      : best
  );
}

export function pickBestAudioStream(
  streams: AudioStream[],
  quality: AudioQuality,
  preferHls: boolean,
  mp4Only: boolean = false
): AudioStream | null {
  if (streams.length === 0) return null;

  const directStreams = streams.filter((stream) => stream.streamType !== 'hls');
  const hlsStream = streams.find((stream) => stream.streamType === 'hls');

  // Try mp4/aac direct streams (best quality for iOS native playback)
  const mp4Streams = directStreams.filter(
    (s) =>
      s.mimeType.includes('audio/mp4') || s.mimeType.includes('audio/m4a')
  );

  if (mp4Only) {
    return pickByQuality(mp4Streams, quality);
  }

  // When preferHls is set, use HLS first — AVPlayer handles it natively
  // and YouTube's HLS manifests don't require PoToken authentication.
  if (preferHls && hlsStream) {
    return hlsStream;
  }

  if (mp4Streams.length > 0) {
    return pickByQuality(mp4Streams, quality);
  }

  // Fall back to HLS even when not preferred
  if (hlsStream) {
    return hlsStream;
  }

  // Last resort: webm/opus or any remaining format
  return pickByQuality(directStreams, quality);
}

// ─── Video Details ──────────────────────────────────────────────────

export async function getVideoDetails(videoId: string): Promise<{
  title: string;
  uploader: string;
  thumbnailUrl: string;
  duration: number;
} | null> {
  try {
    const response = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: data.title || '',
      uploader: data.author_name || '',
      thumbnailUrl:
        data.thumbnail_url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
    };
  } catch {
    return null;
  }
}
