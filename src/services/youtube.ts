import { SearchResult, AudioStream } from '../types';
import {
  PIPED_INSTANCES,
  INVIDIOUS_INSTANCES,
  STREAM_URL_TTL,
  AUDIO_QUALITY_BITRATE,
  AudioQuality,
} from '../utils/constants';
import { mmkvStorage } from './storage';

// ─── YouTube Search via Piped API ────────────────────────────────────

interface PipedSearchItem {
  url: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl: string;
  duration: number;
  views: number;
  uploadedDate: string;
  type: string;
}

interface PipedSearchResponse {
  items: PipedSearchItem[];
  nextpage: string;
  suggestion: string;
}

export async function searchYouTube(
  query: string,
  filter: string = 'music_songs'
): Promise<SearchResult[]> {
  const errors: string[] = [];

  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      const data: PipedSearchResponse = await response.json();

      return (data.items || [])
        .filter((item) => item.type === 'stream')
        .map((item) => ({
          videoId: extractVideoId(item.url),
          title: item.title,
          uploaderName: item.uploaderName,
          uploaderUrl: item.uploaderUrl,
          thumbnailUrl: item.thumbnail,
          duration: item.duration,
          views: item.views,
          uploadedDate: item.uploadedDate,
        }));
    } catch (err: any) {
      errors.push(`${instance}: ${err.message}`);
      continue;
    }
  }

  // Fallback to Invidious
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      const data: any[] = await response.json();

      return data
        .filter((item) => item.type === 'video')
        .map((item) => ({
          videoId: item.videoId,
          title: item.title,
          uploaderName: item.author,
          uploaderUrl: item.authorUrl,
          thumbnailUrl:
            item.videoThumbnails?.find((t: any) => t.quality === 'medium')?.url ||
            item.videoThumbnails?.[0]?.url ||
            '',
          duration: item.lengthSeconds,
          views: item.viewCount,
          uploadedDate: item.publishedText,
        }));
    } catch (err: any) {
      errors.push(`${instance}: ${err.message}`);
      continue;
    }
  }

  console.warn('All search instances failed:', errors);
  throw new Error('Search failed. Please check your internet connection and try again.');
}

// ─── Audio Stream Extraction ────────────────────────────────────────

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

export async function getAudioStreamUrl(
  videoId: string,
  quality: AudioQuality = 'high'
): Promise<string> {
  // Check cache first
  const cached = getCachedStreamUrl(videoId);
  if (cached) return cached;

  const targetBitrate = AUDIO_QUALITY_BITRATE[quality];
  const errors: string[] = [];

  // Try Piped instances
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/streams/${videoId}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const audioStreams: AudioStream[] = (data.audioStreams || []).map((s: any) => ({
        url: s.url,
        mimeType: s.mimeType,
        bitrate: s.bitrate,
        quality: s.quality,
        codec: s.codec,
      }));

      // Pick best audio stream — prefer mp4/aac for iOS compatibility
      const streamUrl = pickBestAudioStream(audioStreams, targetBitrate);
      if (streamUrl) {
        cacheStreamUrl(videoId, streamUrl);
        return streamUrl;
      }
    } catch (err: any) {
      errors.push(`Piped ${instance}: ${err.message}`);
      continue;
    }
  }

  // Fallback: Invidious
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const audioStreams: AudioStream[] = (data.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('audio/'))
        .map((f: any) => ({
          url: f.url,
          mimeType: f.type?.split(';')[0] || '',
          bitrate: parseInt(f.bitrate || '0'),
          quality: f.audioQuality || '',
          codec: f.encoding || '',
        }));

      const streamUrl = pickBestAudioStream(audioStreams, targetBitrate);
      if (streamUrl) {
        cacheStreamUrl(videoId, streamUrl);
        return streamUrl;
      }
    } catch (err: any) {
      errors.push(`Invidious ${instance}: ${err.message}`);
      continue;
    }
  }

  console.warn('All stream instances failed:', errors);
  throw new Error('Could not get audio stream. Please try again later.');
}

function pickBestAudioStream(
  streams: AudioStream[],
  targetBitrate: number
): string | null {
  if (streams.length === 0) return null;

  // Prefer mp4/aac for iOS native playback
  const mp4Streams = streams.filter(
    (s) => s.mimeType.includes('audio/mp4') || s.mimeType.includes('audio/m4a')
  );

  // If no mp4, fall back to webm (some formats may still play)
  const candidates = mp4Streams.length > 0 ? mp4Streams : streams;

  // Sort by how close the bitrate is to target (prefer higher quality)
  candidates.sort((a, b) => {
    const aDiff = Math.abs(a.bitrate - targetBitrate);
    const bDiff = Math.abs(b.bitrate - targetBitrate);
    return aDiff - bDiff;
  });

  return candidates[0]?.url || null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractVideoId(url: string): string {
  // Piped returns URLs like "/watch?v=VIDEO_ID"
  const match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  // Fallback: try last path segment
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

export async function getVideoDetails(videoId: string): Promise<{
  title: string;
  uploader: string;
  thumbnailUrl: string;
  duration: number;
} | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${instance}/streams/${videoId}`);
      if (!response.ok) continue;
      const data = await response.json();
      return {
        title: data.title,
        uploader: data.uploader,
        thumbnailUrl: data.thumbnailUrl,
        duration: data.duration,
      };
    } catch {
      continue;
    }
  }
  return null;
}
