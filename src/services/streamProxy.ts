import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { ResolvedAudioSource } from '../types';

/**
 * In-app HTTP proxy (modules/stream-proxy). YouTube throttles any single
 * request over ~10 MB, and the iOS player asks for whole files, so long tracks
 * would never load. The proxy answers the player's requests by fetching from
 * YouTube in pieces under that limit.
 */
interface StreamProxyModule {
  /** Starts the proxy if needed; resolves to its port on 127.0.0.1. */
  start(): Promise<number>;
}

const StreamProxy =
  Platform.OS === 'ios' ? requireOptionalNativeModule<StreamProxyModule>('StreamProxy') : null;

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  return 'bin';
}

/**
 * URL the player (or a download) should use for a direct stream: the proxy
 * when it's available and the size is known, otherwise the stream itself.
 */
export async function getProxiedStreamUrl(source: ResolvedAudioSource): Promise<string> {
  if (!StreamProxy || source.streamType === 'hls' || !source.contentLength) {
    return source.url;
  }
  try {
    const port = await StreamProxy.start();
    const query = [
      `len=${source.contentLength}`,
      `type=${encodeURIComponent(source.mimeType)}`,
      `u=${encodeURIComponent(source.url)}`,
    ].join('&');
    return `http://127.0.0.1:${port}/stream.${extensionFor(source.mimeType)}?${query}`;
  } catch (err) {
    console.warn('Stream proxy unavailable, streaming directly:', err);
    return source.url;
  }
}
