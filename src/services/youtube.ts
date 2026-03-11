import { SearchResult, AudioStream, ResolvedAudioSource } from '../types';
import {
  STREAM_URL_TTL,
  AUDIO_QUALITY_BITRATE,
  REQUEST_TIMEOUT,
  AudioQuality,
} from '../utils/constants';
import { mmkvStorage } from './storage';
import { extractStreamsViaWebView } from './StreamExtractorWebView';

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

// ─── Audio Stream Extraction (watch page scraping) ──────────────────

interface CachedStreamUrl {
  url: string;
  mimeType: string;
  streamType: 'default' | 'hls';
  timestamp: number;
}

const STREAM_SOURCE_CACHE_VERSION = 'v4';

type AudioResolveMode = 'direct' | 'playback';

interface ResolveAudioOptions {
  allowAdaptiveManifest?: boolean;
  preferHls?: boolean;
  cacheMode: AudioResolveMode;
}

function getCachedAudioSource(
  videoId: string,
  mode: AudioResolveMode
): ResolvedAudioSource | null {
  const cached = mmkvStorage.getObject<CachedStreamUrl>(
    `stream_${STREAM_SOURCE_CACHE_VERSION}_${mode}_${videoId}`
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
  source: ResolvedAudioSource
): void {
  mmkvStorage.setObject<CachedStreamUrl>(
    `stream_${STREAM_SOURCE_CACHE_VERSION}_${mode}_${videoId}`,
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
 * Extract ytInitialPlayerResponse from a YouTube watch page.
 * YouTube embeds the full player config (including stream URLs) in the HTML.
 */
function extractPlayerResponse(html: string): any | null {
  const patterns = [
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script)/s,
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script)/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]);
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function getStreamFromWatchPage(
  videoId: string,
  allowAdaptiveManifest: boolean
): Promise<AudioStream[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&has_verified=1`;
  const response = await fetchWithTimeout(
    watchUrl,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    },
    15000
  );

  if (!response.ok) {
    throw new Error(`Watch page returned ${response.status}`);
  }

  const html = await response.text();
  const playerResponse = extractPlayerResponse(html);

  if (!playerResponse) {
    throw new Error('Could not extract player data from watch page');
  }

  const status = playerResponse?.playabilityStatus?.status;
  if (status && status !== 'OK') {
    throw new Error(
      `Video not playable: ${playerResponse.playabilityStatus?.reason || status}`
    );
  }

  return extractAudioStreamsFromStreamingData(playerResponse?.streamingData, {
    allowAdaptiveManifest,
  });
}

/**
 * Fallback: try InnerTube player API with alternative client identities.
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

// ─── Piped API Fallback ─────────────────────────────────────────────

const PIPED_API_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.moomoo.me',
  'https://api-piped.mha.fi',
  'https://pipedapi.rivo.lol',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.leptons.xyz',
];

// ─── Invidious API Fallback ─────────────────────────────────────────

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://inv.tux.pizza',
  'https://invidious.privacyredirect.com',
  'https://iv.ggtyler.dev',
];

// ─── Instance Health Tracking ───────────────────────────────────────
// Remember which instances responded recently so we try them first
// instead of wasting 12s per dead instance.

const INSTANCE_HEALTH_TTL = 10 * 60 * 1000; // 10 minutes

const instanceHealth = new Map<string, { ok: boolean; timestamp: number }>();

function recordInstanceHealth(instance: string, ok: boolean): void {
  instanceHealth.set(instance, { ok, timestamp: Date.now() });
}

function sortByHealth(instances: string[]): string[] {
  const now = Date.now();
  return [...instances].sort((a, b) => {
    const healthA = instanceHealth.get(a);
    const healthB = instanceHealth.get(b);

    const aHealthy =
      healthA && now - healthA.timestamp < INSTANCE_HEALTH_TTL
        ? healthA.ok
        : null;
    const bHealthy =
      healthB && now - healthB.timestamp < INSTANCE_HEALTH_TTL
        ? healthB.ok
        : null;

    // Known-healthy first, unknown middle, known-dead last
    const scoreA = aHealthy === true ? 0 : aHealthy === null ? 1 : 2;
    const scoreB = bHealthy === true ? 0 : bHealthy === null ? 1 : 2;
    return scoreA - scoreB;
  });
}

async function getStreamFromPipedAPI(
  videoId: string
): Promise<AudioStream[]> {
  for (const instance of sortByHealth(PIPED_API_INSTANCES).slice(0, 3)) {
    try {
      const response = await fetchWithTimeout(
        `${instance}/streams/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        6000
      );

      if (!response.ok) {
        recordInstanceHealth(instance, false);
        continue;
      }

      const data = await response.json();
      const audioStreams: AudioStream[] = (data.audioStreams || [])
        .filter((s: any) => s.url && s.url.length > 0)
        .map((s: any) => ({
          url: s.url,
          mimeType: (s.mimeType || s.format || 'audio/mp4').split(';')[0],
          bitrate: s.bitrate || 0,
          quality: s.quality || '',
          codec: s.codec || '',
        }));

      if (audioStreams.length > 0) {
        recordInstanceHealth(instance, true);
        return audioStreams;
      }
    } catch {
      recordInstanceHealth(instance, false);
      continue;
    }
  }

  return [];
}

async function getStreamFromInvidious(
  videoId: string
): Promise<AudioStream[]> {
  for (const instance of sortByHealth(INVIDIOUS_INSTANCES).slice(0, 3)) {
    try {
      const response = await fetchWithTimeout(
        `${instance}/api/v1/videos/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        6000
      );

      if (!response.ok) {
        recordInstanceHealth(instance, false);
        continue;
      }

      const data = await response.json();
      const allFormats = data.adaptiveFormats || [];

      const audioStreams: AudioStream[] = allFormats
        .filter((f: any) => f.type && f.type.startsWith('audio/'))
        .map((f: any) => ({
          url: f.url || '',
          mimeType: (f.type || 'audio/mp4').split(';')[0],
          bitrate: f.bitrate ? parseInt(f.bitrate, 10) : 0,
          quality: f.audioQuality || '',
          codec: f.encoding || '',
        }))
        .filter((s: AudioStream) => s.url !== '');

      if (audioStreams.length > 0) {
        recordInstanceHealth(instance, true);
        return audioStreams;
      }
    } catch {
      recordInstanceHealth(instance, false);
      continue;
    }
  }

  return [];
}

/**
 * Invalidate the cached stream URL for a video so the next resolve
 * will re-fetch from the server.  Called after a playback error.
 */
export function invalidateStreamCache(videoId: string): void {
  const modes: AudioResolveMode[] = ['direct', 'playback'];
  for (const mode of modes) {
    const key = `stream_${STREAM_SOURCE_CACHE_VERSION}_${mode}_${videoId}`;
    mmkvStorage.delete(key);
  }
}

async function resolveAudioSource(
  videoId: string,
  quality: AudioQuality,
  options: ResolveAudioOptions
): Promise<ResolvedAudioSource> {
  const { allowAdaptiveManifest = false, preferHls = false, cacheMode } = options;

  const cached = getCachedAudioSource(videoId, cacheMode);
  if (cached) return cached;

  const targetBitrate = AUDIO_QUALITY_BITRATE[quality];
  const errors: string[] = [];

  // Helper: attempt a stream source, returning null on failure
  const trySource = async (
    name: string,
    fn: () => Promise<AudioStream[]>,
    usePreferHls = false
  ): Promise<ResolvedAudioSource | null> => {
    try {
      const streams = await fn();
      const stream = pickBestAudioStream(streams, targetBitrate, usePreferHls);
      if (stream) {
        const source = toResolvedAudioSource(stream);
        cacheAudioSource(videoId, cacheMode, source);
        return source;
      }
      errors.push(`${name}: no suitable audio stream found`);
    } catch (err: any) {
      errors.push(`${name}: ${err.message}`);
    }
    return null;
  };

  // ── Phase 1: Race Piped, Invidious, and InnerTube in parallel ─────
  // Whichever returns a valid stream first wins immediately.
  const phase1Result = await new Promise<ResolvedAudioSource | null>(
    (resolve) => {
      let settled = false;
      let pending = 3;

      const onResult = (source: ResolvedAudioSource | null) => {
        if (settled) return;
        if (source) {
          settled = true;
          resolve(source);
        } else {
          pending--;
          if (pending === 0) {
            resolve(null);
          }
        }
      };

      trySource('Piped API', () => getStreamFromPipedAPI(videoId)).then(onResult);
      trySource('Invidious API', () => getStreamFromInvidious(videoId)).then(onResult);
      trySource(
        'InnerTube',
        async () => {
          const result = await getStreamFromInnerTube(videoId, allowAdaptiveManifest);
          if (result.streams.length === 0 && result.diagnostics.length > 0) {
            throw new Error(result.diagnostics.join('; '));
          }
          return result.streams;
        },
        preferHls
      ).then(onResult);
    }
  );

  if (phase1Result) return phase1Result;

  // ── Phase 2: Sequential fallbacks (heavier methods) ───────────────

  // 4. WebView extraction — runs YouTube's real player with BotGuard/PoToken.
  const webViewResult = await trySource('WebView', async () => {
    const wvStreams = await extractStreamsViaWebView(videoId);
    return wvStreams.map((stream) => ({
      ...stream,
      codec: '',
      streamType: 'default' as const,
    }));
  });
  if (webViewResult) return webViewResult;

  // 5. Watch page scraping (limited – can't handle ciphered/SABR streams)
  const watchResult = await trySource(
    'Watch page',
    () => getStreamFromWatchPage(videoId, allowAdaptiveManifest),
    preferHls
  );
  if (watchResult) return watchResult;

  console.warn('All stream methods failed:', errors);
  throw new Error(
    `Could not get audio stream.\n${errors.join('\n')}`
  );
}

export async function getAudioPlaybackSource(
  videoId: string,
  quality: AudioQuality = 'high'
): Promise<ResolvedAudioSource> {
  return resolveAudioSource(videoId, quality, {
    allowAdaptiveManifest: true,
    // Prefer HLS: AVPlayer handles it natively and YouTube serves it reliably.
    // Direct mp4 URLs from YouTube CDN often get blocked without a PoToken.
    preferHls: true,
    cacheMode: 'playback',
  });
}

export async function getAudioStreamUrl(
  videoId: string,
  quality: AudioQuality = 'high'
): Promise<string> {
  const source = await resolveAudioSource(videoId, quality, {
    allowAdaptiveManifest: false,
    preferHls: false,
    cacheMode: 'direct',
  });
  return source.url;
}

function pickBestAudioStream(
  streams: AudioStream[],
  targetBitrate: number,
  preferHls: boolean
): AudioStream | null {
  if (streams.length === 0) return null;

  const directStreams = streams.filter((stream) => stream.streamType !== 'hls');
  const hlsStream = streams.find((stream) => stream.streamType === 'hls');

  // When preferHls is set, use HLS first — AVPlayer handles it natively
  // and YouTube's HLS manifests don't require PoToken authentication.
  if (preferHls && hlsStream) {
    return hlsStream;
  }

  // Try mp4/aac direct streams (best quality for iOS native playback)
  const mp4Streams = directStreams.filter(
    (s) =>
      s.mimeType.includes('audio/mp4') || s.mimeType.includes('audio/m4a')
  );

  if (mp4Streams.length > 0) {
    mp4Streams.sort((a, b) => {
      const aDiff = Math.abs(a.bitrate - targetBitrate);
      const bDiff = Math.abs(b.bitrate - targetBitrate);
      return aDiff - bDiff;
    });
    return mp4Streams[0] || null;
  }

  // Fall back to HLS even when not preferred
  if (hlsStream) {
    return hlsStream;
  }

  // Last resort: webm/opus or any remaining format
  const candidates = directStreams;
  candidates.sort((a, b) => {
    const aDiff = Math.abs(a.bitrate - targetBitrate);
    const bDiff = Math.abs(b.bitrate - targetBitrate);
    return aDiff - bDiff;
  });

  return candidates[0] || null;
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
