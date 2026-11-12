// Turns the technical text of a playback failure (stream resolver
// diagnostics, AVPlayer messages) into something worth showing.

export type PlaybackErrorKind =
  | 'offline'
  | 'blocked'
  | 'age-restricted'
  | 'region'
  | 'unavailable'
  | 'timeout'
  | 'no-audio'
  | 'unknown';

export interface PlaybackErrorInfo {
  kind: PlaybackErrorKind;
  title: string;
  message: string;
  /** The original error text, for troubleshooting. */
  details: string;
}

const MESSAGES: Record<PlaybackErrorKind, { title: string; message: string }> = {
  offline: {
    title: 'No Internet Connection',
    message:
      'This song needs an internet connection. Downloaded songs still play offline.',
  },
  blocked: {
    title: 'YouTube Blocked the Request',
    message:
      'YouTube refused to hand out this song right now. Wait a moment and try again; switching between Wi-Fi and mobile data often helps.',
  },
  'age-restricted': {
    title: 'Age-Restricted Song',
    message: 'YouTube only plays this song for signed-in users, so it can’t be played here.',
  },
  region: {
    title: 'Not Available in Your Country',
    message: 'YouTube doesn’t offer this song in your country. Another upload of it may work.',
  },
  unavailable: {
    title: 'Song Unavailable',
    message:
      'This song was removed, made private or isn’t available on YouTube any more. Search for another upload of it.',
  },
  timeout: {
    title: 'Connection Too Slow',
    message: 'Loading the song took too long. Check your connection and try again.',
  },
  'no-audio': {
    title: 'No Playable Audio',
    message: 'YouTube has no audio stream for this song that the app can play.',
  },
  unknown: {
    title: 'Playback Error',
    message: 'The song could not be played. Try again, or try another upload of it.',
  },
};

const PATTERNS: [PlaybackErrorKind, RegExp][] = [
  [
    'offline',
    /network request failed|appears to be offline|not connected to the internet|network connection was lost|NSURLErrorDomain.*-100[59]/i,
  ],
  ['age-restricted', /confirm your age|age[- ]restricted|inappropriate for some users/i],
  ['region', /available in your country|blocked it in your country|in your region/i],
  // Checked before "unavailable": YouTube words bot checks as the video being unavailable
  [
    'blocked',
    /not a bot|stream blocked|HTTP 403|HTTP 429|attestation was rejected|botguard|GenerateIT returned/i,
  ],
  [
    'unavailable',
    /video unavailable|private video|is unavailable|not available|no longer available|has been removed|UNPLAYABLE|LOGIN_REQUIRED|\bERROR\b/,
  ],
  ['timeout', /timed out|timeout|abort/i],
  ['no-audio', /no suitable|no playable audio|no downloadable/i],
];

/**
 * @param isOnline false when the device is known to be offline; that explains
 *   any failure better than the error text does.
 */
export function describePlaybackError(
  rawError: string,
  isOnline: boolean | null = null
): PlaybackErrorInfo {
  const details = rawError.trim();
  const kind: PlaybackErrorKind =
    isOnline === false
      ? 'offline'
      : (PATTERNS.find(([, pattern]) => pattern.test(details))?.[0] ?? 'unknown');

  return { kind, ...MESSAGES[kind], details };
}
