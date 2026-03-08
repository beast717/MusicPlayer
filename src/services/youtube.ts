import { Platform } from 'react-native';
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
    `stream_${mode}_${videoId}`
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
  mmkvStorage.setObject<CachedStreamUrl>(`stream_${mode}_${videoId}`, {
    url: source.url,
    mimeType: source.mimeType,
    streamType: source.streamType,
    timestamp: Date.now(),
  });
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

  if (directAudioStreams.length > 0) {
    return directAudioStreams;
  }

  if (allowAdaptiveManifest && streamingData?.hlsManifestUrl) {
    return [
      {
        url: streamingData.hlsManifestUrl,
        mimeType: 'application/x-mpegURL',
        bitrate: 0,
        quality: 'hls',
        codec: 'hls',
        streamType: 'hls',
      },
    ];
  }

  return [];
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
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.drgns.space',
];

// ─── Invidious API Fallback ─────────────────────────────────────────

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://inv.tux.pizza',
];

async function getStreamFromPipedAPI(
  videoId: string
): Promise<AudioStream[]> {
  for (const instance of PIPED_API_INSTANCES) {
    try {
      const response = await fetchWithTimeout(
        `${instance}/streams/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        12000
      );

      if (!response.ok) continue;

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

      if (audioStreams.length > 0) return audioStreams;
    } catch {
      continue;
    }
  }

  return [];
}

async function getStreamFromInvidious(
  videoId: string
): Promise<AudioStream[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetchWithTimeout(
        `${instance}/api/v1/videos/${videoId}`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        12000
      );

      if (!response.ok) continue;

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

      if (audioStreams.length > 0) return audioStreams;
    } catch {
      continue;
    }
  }

  return [];
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

  // Method 1: InnerTube player API (IOS first, ANDROID_VR fallback)
  try {
    const result = await getStreamFromInnerTube(videoId, allowAdaptiveManifest);
    const stream = pickBestAudioStream(
      result.streams,
      targetBitrate,
      preferHls
    );
    if (stream) {
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, source);
      return source;
    }
    const diag = result.diagnostics.length > 0
      ? result.diagnostics.join('; ')
      : `streams=${result.streams.length}`;
    errors.push(`InnerTube: ${diag}`);
  } catch (err: any) {
    errors.push(`InnerTube: ${err.message}`);
  }

  // Method 2: WebView extraction (uses YouTube's own player with BotGuard/PoToken)
  try {
    const wvStreams = await extractStreamsViaWebView(videoId);
    const directStreams: AudioStream[] = wvStreams.map((stream) => ({
      ...stream,
      codec: '',
      streamType: 'default',
    }));
    const stream = pickBestAudioStream(directStreams, targetBitrate, false);
    if (stream) {
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, source);
      return source;
    }
    errors.push(`WebView: ${wvStreams.length} streams but no usable URL`);
  } catch (err: any) {
    errors.push(`WebView: ${err.message}`);
  }

  // Method 3: Piped API (deciphers signatures server-side)
  try {
    const streams = await getStreamFromPipedAPI(videoId);
    const stream = pickBestAudioStream(streams, targetBitrate, false);
    if (stream) {
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, source);
      return source;
    }
    errors.push('Piped API: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`Piped API: ${err.message}`);
  }

  // Method 4: Invidious API (also deciphers server-side)
  try {
    const streams = await getStreamFromInvidious(videoId);
    const stream = pickBestAudioStream(streams, targetBitrate, false);
    if (stream) {
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, source);
      return source;
    }
    errors.push('Invidious API: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`Invidious API: ${err.message}`);
  }

  // Method 5: Scrape YouTube watch page (limited – can't handle ciphered/SABR streams)
  try {
    const streams = await getStreamFromWatchPage(videoId, allowAdaptiveManifest);
    const stream = pickBestAudioStream(streams, targetBitrate, preferHls);
    if (stream) {
      const source = toResolvedAudioSource(stream);
      cacheAudioSource(videoId, cacheMode, source);
      return source;
    }
    errors.push('Watch page: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`Watch page: ${err.message}`);
  }

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
    allowAdaptiveManifest: Platform.OS === 'ios',
    preferHls: Platform.OS === 'ios',
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

  if (preferHls) {
    const hlsStream = streams.find((stream) => stream.streamType === 'hls');
    if (hlsStream) {
      return hlsStream;
    }
  }

  // Prefer mp4/aac for iOS native playback
  const mp4Streams = streams.filter(
    (s) =>
      s.mimeType.includes('audio/mp4') || s.mimeType.includes('audio/m4a')
  );

  // If no mp4, fall back to webm/opus
  const candidates = mp4Streams.length > 0 ? mp4Streams : streams;

  // Sort by how close the bitrate is to target
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
