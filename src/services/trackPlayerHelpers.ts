import { Platform } from 'react-native';
import { AddTrack, TrackType } from 'react-native-track-player';
import { ResolvedAudioSource, Track } from '../types';
import { useLibraryStore } from '../stores/libraryStore';
import { getLocalFilePath } from './downloadManager';
import { getAudioPlaybackSource } from './youtube';
import { getProxiedStreamUrl } from './streamProxy';

export const IOS_REMOTE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';

/** URL for queued tracks whose stream is resolved just-in-time on track change. */
export const PLACEHOLDER_URL = 'https://placeholder.invalid';

export interface PlayerTrackSource {
  url: string;
  type?: TrackType;
  contentType?: string;
  userAgent?: string;
  streamDebug?: string;
}

export function getUrlHost(url: string): string {
  try {
    return new URL(url).host || 'unknown-host';
  } catch {
    return 'invalid-url';
  }
}

export async function buildTrackPlayerSource(
  source: ResolvedAudioSource
): Promise<PlayerTrackSource> {
  const url = await getProxiedStreamUrl(source);
  const via = url === source.url ? '' : ' via=local-proxy';
  const baseSource: PlayerTrackSource = {
    url,
    contentType: source.mimeType,
    streamDebug: `streamType=${source.streamType} mimeType=${source.mimeType} host=${getUrlHost(source.url)}${via}`,
  };

  if (Platform.OS === 'ios') {
    baseSource.userAgent = IOS_REMOTE_USER_AGENT;
  }

  if (source.streamType === 'hls') {
    baseSource.type = TrackType.HLS;
  }

  return baseSource;
}

export function getActiveTrackDebug(activeTrack: any): string {
  if (!activeTrack) {
    return '';
  }

  if (typeof activeTrack.streamDebug === 'string' && activeTrack.streamDebug) {
    return activeTrack.streamDebug;
  }

  const parts = [
    activeTrack.type ? `type=${activeTrack.type}` : '',
    activeTrack.contentType ? `contentType=${activeTrack.contentType}` : '',
    activeTrack.url ? `host=${getUrlHost(String(activeTrack.url))}` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

/** Local file if the track is downloaded, otherwise null. */
export function getLocalTrackSource(track: Track): PlayerTrackSource | null {
  const isDownloaded = useLibraryStore.getState().isDownloaded(track.id);
  return isDownloaded ? { url: getLocalFilePath(track.id) } : null;
}

let prefetchQueue: Promise<void> = Promise.resolve();

/**
 * Resolve upcoming tracks' streams ahead of time so they start from the cache.
 * Streams are resolved in a WebView, which iOS may pause while the app is in
 * the background; waiting until a track starts could then stall the queue.
 */
export function prefetchStreams(tracks: Track[]): void {
  for (const track of tracks) {
    if (getLocalTrackSource(track)) continue;
    // One at a time, after any earlier prefetches
    prefetchQueue = prefetchQueue.then(() =>
      getAudioPlaybackSource(track.id).then(
        () => undefined,
        (err) => console.warn(`Prefetch failed for ${track.id}:`, err?.message ?? err)
      )
    );
  }
}

/** Local file if downloaded, otherwise a freshly resolved stream. */
export async function resolveTrackSource(track: Track): Promise<PlayerTrackSource> {
  return (
    getLocalTrackSource(track) ??
    (await buildTrackPlayerSource(await getAudioPlaybackSource(track.id)))
  );
}

export function toTrackPlayerTrack(track: Track, source: PlayerTrackSource): AddTrack {
  return {
    id: track.id,
    ...source,
    title: track.title,
    artist: track.artist,
    artwork: track.localThumbnailPath || track.thumbnailUrl,
    duration: track.duration,
  };
}
