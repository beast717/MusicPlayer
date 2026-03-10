import { Platform } from 'react-native';
import { TrackType } from 'react-native-track-player';
import { ResolvedAudioSource } from '../types';

export const IOS_REMOTE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1';

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

export function buildTrackPlayerSource(
  source: ResolvedAudioSource
): PlayerTrackSource {
  const baseSource: PlayerTrackSource = {
    url: source.url,
    contentType: source.mimeType,
    streamDebug: `streamType=${source.streamType} mimeType=${source.mimeType} host=${getUrlHost(source.url)}`,
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
