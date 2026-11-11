import { Track } from '../types';
import { REQUEST_TIMEOUT } from '../utils/constants';
import { mmkvStorage } from './storage';

// ─── YouTube Music radio ("songs like this one") ────────────────────
// The `next` endpoint with an RDAMVM playlist returns the automix YouTube
// Music builds for a song. It needs no login, so recommendations are driven
// by the local listening history choosing which songs to ask about.

const YTM_NEXT_URL = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false';

const YTM_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250310.01.00',
    hl: 'en',
    gl: 'US',
  },
};

const RADIO_CACHE_PREFIX = 'radio_v1_';
export const RADIO_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

interface CachedRadio {
  tracks: Track[];
  timestamp: number;
}

function parseDuration(text: string | undefined): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function joinRuns(runs: { text: string }[] | undefined): string {
  return (runs || []).map((r) => r.text).join('');
}

/** Extract the tracks of a radio from a `next` response. Unknown shapes yield []. */
export function parseRadioResponse(data: any): Track[] {
  const items =
    data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
  if (!Array.isArray(items)) return [];

  const tracks: Track[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const video = item?.playlistPanelVideoRenderer;
    const id = video?.videoId;
    const title = joinRuns(video?.title?.runs);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);

    const thumbnails = video.thumbnail?.thumbnails;
    tracks.push({
      id,
      title,
      artist: joinRuns(video.shortBylineText?.runs),
      duration: parseDuration(joinRuns(video.lengthText?.runs)),
      thumbnailUrl:
        thumbnails?.[thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });
  }

  return tracks;
}

const inFlight = new Map<string, Promise<Track[]>>();

async function fetchRadio(videoId: string): Promise<Track[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(YTM_NEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com',
      },
      body: JSON.stringify({
        context: YTM_CONTEXT,
        videoId,
        playlistId: `RDAMVM${videoId}`,
        isAudioOnly: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`YouTube Music radio returned ${response.status}`);
    }

    const tracks = parseRadioResponse(await response.json());
    if (tracks.length === 0) {
      throw new Error('YouTube Music radio returned no tracks');
    }
    return tracks;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Songs similar to the given one (the seed itself is usually first).
 * Cached for 12 hours; `forceRefresh` skips the cache.
 */
export async function getRadioTracks(
  videoId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<Track[]> {
  const cacheKey = `${RADIO_CACHE_PREFIX}${videoId}`;

  if (!options.forceRefresh) {
    const cached = mmkvStorage.getObject<CachedRadio>(cacheKey);
    if (cached?.tracks?.length && Date.now() - cached.timestamp < RADIO_CACHE_TTL) {
      return cached.tracks;
    }
  }

  const pending = inFlight.get(videoId);
  if (pending) return pending;

  const request = fetchRadio(videoId)
    .then((tracks) => {
      mmkvStorage.setObject<CachedRadio>(cacheKey, { tracks, timestamp: Date.now() });
      return tracks;
    })
    .finally(() => inFlight.delete(videoId));

  inFlight.set(videoId, request);
  return request;
}

/** Remove expired radios so the cache doesn't grow as seeds change over time. */
export function pruneRadioCache(): number {
  const now = Date.now();
  let removed = 0;

  for (const key of mmkvStorage.getAllKeys()) {
    if (!key.startsWith('radio_')) continue;

    const cached = key.startsWith(RADIO_CACHE_PREFIX)
      ? mmkvStorage.getObject<CachedRadio>(key)
      : undefined;
    if (!cached?.timestamp || now - cached.timestamp >= RADIO_CACHE_TTL) {
      mmkvStorage.delete(key);
      removed++;
    }
  }

  return removed;
}
