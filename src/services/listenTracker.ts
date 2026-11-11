import { Track } from '../types';

// Turns the player's once-a-second progress events into "played" and
// "skipped" signals for the listening history.

/** Seconds of actual listening before a track counts as played. */
export const PLAY_THRESHOLD_SECONDS = 30;
/** Abandoning a track after at least this much listening counts as a skip. */
const MIN_SKIP_SECONDS = 1;
/** Position jumps larger than this are seeks, not listening. */
const MAX_TICK_SECONDS = 2.5;

interface ListenSession {
  track: Track;
  listened: number;
  lastPosition: number;
  counted: boolean;
}

interface ListenTrackerCallbacks {
  onPlay: (track: Track) => void;
  onSkip: (track: Track) => void;
}

function playThreshold(track: Track): number {
  // Short tracks count once half of them has been heard
  return track.duration > 0
    ? Math.min(PLAY_THRESHOLD_SECONDS, track.duration / 2)
    : PLAY_THRESHOLD_SECONDS;
}

export function createListenTracker({ onPlay, onSkip }: ListenTrackerCallbacks) {
  let session: ListenSession | null = null;

  const endSession = () => {
    if (session && !session.counted && session.listened >= MIN_SKIP_SECONDS) {
      onSkip(session.track);
    }
    session = null;
  };

  return {
    /** Call on every progress event with the track that is actually playing. */
    onProgress(track: Track | null, position: number): void {
      if (!track) return;

      const restarted =
        session != null &&
        session.track.id === track.id &&
        session.counted &&
        position < 3 &&
        session.lastPosition - position > 5;

      if (!session || session.track.id !== track.id || restarted) {
        endSession();
        session = { track, listened: 0, lastPosition: position, counted: false };
        return;
      }

      const delta = position - session.lastPosition;
      session.lastPosition = position;
      if (delta > 0 && delta <= MAX_TICK_SECONDS) {
        session.listened += delta;
      }

      if (!session.counted && session.listened >= playThreshold(track)) {
        session.counted = true;
        onPlay(track);
      }
    },
  };
}
