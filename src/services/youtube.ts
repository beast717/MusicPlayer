import { SearchResult, AudioStream } from '../types';
import {
  STREAM_URL_TTL,
  AUDIO_QUALITY_BITRATE,
  REQUEST_TIMEOUT,
  AudioQuality,
} from '../utils/constants';
import { mmkvStorage } from './storage';

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
    clientVersion: '2.20240101.01.00',
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
  timestamp: number;
}

function getCachedStreamUrl(videoId: string): string | null {
  const cached = mmkvStorage.getObject<CachedStreamUrl>(`stream_${videoId}`);
  if (cached && Date.now() - cached.timestamp < STREAM_URL_TTL) {
    return cached.url;
  }
  return null;
}

function cacheStreamUrl(videoId: string, url: string): void {
  mmkvStorage.setObject<CachedStreamUrl>(`stream_${videoId}`, {
    url,
    timestamp: Date.now(),
  });
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

async function getStreamFromWatchPage(videoId: string): Promise<AudioStream[]> {
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

  const adaptiveFormats =
    playerResponse?.streamingData?.adaptiveFormats || [];
  const regularFormats =
    playerResponse?.streamingData?.formats || [];
  const allFormats = [...adaptiveFormats, ...regularFormats];

  const audioStreams: AudioStream[] = allFormats
    .filter((f: any) => (f.mimeType || '').startsWith('audio/'))
    .map((f: any) => {
      // Some streams have a direct URL, others use signatureCipher
      let streamUrl = f.url || '';

      // Try to extract URL from signatureCipher (works for non-throttled streams)
      if (!streamUrl && f.signatureCipher) {
        try {
          const params = new URLSearchParams(f.signatureCipher);
          streamUrl = params.get('url') || '';
          // Note: ciphered streams need signature decoding, which we can't do
          // easily client-side. The Piped API fallback handles these.
        } catch {}
      }

      return {
        url: streamUrl,
        mimeType: (f.mimeType || '').split(';')[0],
        bitrate: f.bitrate || 0,
        quality: f.audioQuality || f.quality || '',
        codec: f.mimeType?.match(/codecs="([^"]+)"/)?.[1] || '',
      };
    })
    .filter((s: AudioStream) => s.url !== '');

  return audioStreams;
}

/**
 * Fallback: try InnerTube player API with alternative client identities.
 */
async function getStreamFromInnerTube(
  videoId: string
): Promise<AudioStream[]> {
  const clients = [
    { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30 },
    { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0' },
    { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.0' },
  ];

  for (const client of clients) {
    try {
      const response = await fetchWithTimeout(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { client },
            videoId,
          }),
        },
        10000
      );

      if (!response.ok) continue;

      const data = await response.json();
      if (data.playabilityStatus?.status !== 'OK') continue;

      const adaptiveFormats = data.streamingData?.adaptiveFormats || [];

      const audioStreams: AudioStream[] = adaptiveFormats
        .filter((f: any) => (f.mimeType || '').startsWith('audio/'))
        .map((f: any) => ({
          url: f.url || '',
          mimeType: (f.mimeType || '').split(';')[0],
          bitrate: f.bitrate || 0,
          quality: f.audioQuality || '',
          codec: f.mimeType?.match(/codecs="([^"]+)"/)?.[1] || '',
        }))
        .filter((s: AudioStream) => s.url !== '');

      if (audioStreams.length > 0) return audioStreams;
    } catch {
      continue;
    }
  }

  return [];
}

// ─── Piped API Fallback ─────────────────────────────────────────────

const PIPED_API_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
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

export async function getAudioStreamUrl(
  videoId: string,
  quality: AudioQuality = 'high'
): Promise<string> {
  // Check cache first
  const cached = getCachedStreamUrl(videoId);
  if (cached) return cached;

  const targetBitrate = AUDIO_QUALITY_BITRATE[quality];
  const errors: string[] = [];

  // Method 1: Piped API (most reliable – deciphers signatures server-side)
  try {
    const streams = await getStreamFromPipedAPI(videoId);
    const streamUrl = pickBestAudioStream(streams, targetBitrate);
    if (streamUrl) {
      cacheStreamUrl(videoId, streamUrl);
      return streamUrl;
    }
    errors.push('Piped API: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`Piped API: ${err.message}`);
  }

  // Method 2: Scrape YouTube watch page
  try {
    const streams = await getStreamFromWatchPage(videoId);
    const streamUrl = pickBestAudioStream(streams, targetBitrate);
    if (streamUrl) {
      cacheStreamUrl(videoId, streamUrl);
      return streamUrl;
    }
    errors.push('Watch page: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`Watch page: ${err.message}`);
  }

  // Method 3: InnerTube player API with alternative clients
  try {
    const streams = await getStreamFromInnerTube(videoId);
    const streamUrl = pickBestAudioStream(streams, targetBitrate);
    if (streamUrl) {
      cacheStreamUrl(videoId, streamUrl);
      return streamUrl;
    }
    errors.push('InnerTube player: no suitable audio stream found');
  } catch (err: any) {
    errors.push(`InnerTube player: ${err.message}`);
  }

  console.warn('All stream methods failed:', errors);
  throw new Error('Could not get audio stream. Please try again later.');
}

function pickBestAudioStream(
  streams: AudioStream[],
  targetBitrate: number
): string | null {
  if (streams.length === 0) return null;

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

  return candidates[0]?.url || null;
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
