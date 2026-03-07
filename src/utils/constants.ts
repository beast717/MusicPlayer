// Piped API instances (fallbacks in case primary is down)
export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
];

// Invidious instances (secondary fallback)
export const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.snopyta.org',
  'https://invidious.kavin.rocks',
];

// App constants
export const MAX_SEARCH_HISTORY = 20;
export const STREAM_URL_TTL = 4 * 60 * 60 * 1000; // 4 hours in ms
export const SEARCH_DEBOUNCE_MS = 400;
export const MAX_RECENT_TRACKS = 50;

// Audio quality preference enum
export type AudioQuality = 'low' | 'medium' | 'high';
export const AUDIO_QUALITY_BITRATE: Record<AudioQuality, number> = {
  low: 64000,
  medium: 128000,
  high: 256000,
};
