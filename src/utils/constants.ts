// App constants
export const APP_VERSION = '1.0.0';
export const MAX_SEARCH_HISTORY = 20;
export const STREAM_URL_TTL = 4 * 60 * 60 * 1000; // 4 hours in ms
export const SEARCH_DEBOUNCE_MS = 400;
export const MAX_RECENT_TRACKS = 50;
export const REQUEST_TIMEOUT = 12000; // 12s timeout per request

// Audio quality preference enum
export type AudioQuality = 'low' | 'medium' | 'high';
export const AUDIO_QUALITY_BITRATE: Record<AudioQuality, number> = {
  low: 64000,
  medium: 128000,
  high: 256000,
};
