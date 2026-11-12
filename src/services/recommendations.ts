import { Track } from '../types';
import type { TrackStats } from '../stores/historyStore';

// Pure functions that turn the user's taste (listening history, liked songs
// and "not interested" marks) plus radios fetched for a few "seed" songs into
// the home screen sections.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A play counts half as much after this many days. */
const SCORE_HALF_LIFE_DAYS = 30;
const FORGOTTEN_AFTER_DAYS = 21;
const FORGOTTEN_MIN_PLAYS = 3;
/** Liking a song counts like this many extra plays. */
const LIKE_BONUS = 3;
/** Each skip cancels out this many plays. */
const SKIP_PENALTY = 1;
/** Songs heard this recently are not queued again when the radio keeps playing. */
const RECENT_REPEAT_MS = 2 * 60 * 60 * 1000;

export type HistoryStats = Record<string, TrackStats>;

/** Everything known about what the user does and doesn't want to hear. */
export interface Taste {
  stats: HistoryStats;
  favorites: Track[];
  favoriteIds: Set<string>;
  /** Tracks marked "not interested": never recommended. */
  blockedIds: Set<string>;
}

export function createTaste(
  stats: HistoryStats,
  favorites: Track[] = [],
  notInterested: Record<string, number> = {}
): Taste {
  return {
    stats,
    favorites,
    favoriteIds: new Set(favorites.map((t) => t.id)),
    blockedIds: new Set(Object.keys(notInterested)),
  };
}

export interface Mix {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  tracks: Track[];
}

export interface BecauseYouListened {
  seed: Track;
  tracks: Track[];
}

/** "Luis Fonsi & Daddy Yankee" → "Luis Fonsi"; also drops "- Topic" / "VEVO" channel suffixes. */
export function primaryArtist(artist: string): string {
  const first = artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0] || artist;
  return first
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .trim();
}

function artistKey(track: Track): string {
  return primaryArtist(track.artist).toLowerCase() || `track:${track.id}`;
}

/**
 * Higher = listened to more, and more recently. A like pushes the score up,
 * skips pull it down.
 */
export function scoreTrack(stats: TrackStats, now: number, isFavorite = false): number {
  const ageDays = Math.max(0, now - stats.lastPlayedAt) / DAY_MS;
  const decay = Math.pow(0.5, ageDays / SCORE_HALF_LIFE_DAYS);
  const likes = isFavorite ? LIKE_BONUS : 0;
  return (stats.playCount + likes - SKIP_PENALTY * stats.skipCount) * decay;
}

/**
 * Don't recommend this track: it was marked "not interested", or the user
 * keeps skipping it. A like outweighs skips.
 */
export function isDisliked(taste: Taste, trackId: string): boolean {
  if (taste.blockedIds.has(trackId)) return true;
  if (taste.favoriteIds.has(trackId)) return false;
  const stats = taste.stats[trackId];
  return !!stats && stats.skipCount >= 2 && stats.skipCount > stats.playCount;
}

interface ScoredTrack {
  track: Track;
  score: number;
}

/** Played tracks, best first. */
function rankedByScore(taste: Taste, now: number): ScoredTrack[] {
  return Object.values(taste.stats)
    .filter((s) => s.playCount > 0 && !taste.blockedIds.has(s.track.id))
    .map((s) => ({
      track: s.track,
      score: scoreTrack(s, now, taste.favoriteIds.has(s.track.id)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Liked songs that haven't been played yet still say what the user is into. */
function unplayedFavorites(taste: Taste, now: number): ScoredTrack[] {
  return taste.favorites
    .filter((t) => !!t.addedAt && !(taste.stats[t.id]?.playCount > 0))
    .map((track) => ({
      track,
      score: scoreTrack(
        {
          track,
          playCount: 0,
          skipCount: taste.stats[track.id]?.skipCount ?? 0,
          firstPlayedAt: track.addedAt as number,
          lastPlayedAt: track.addedAt as number,
        },
        now,
        true
      ),
    }))
    .filter((entry) => entry.score > 0);
}

export function getListenAgain(taste: Taste, now: number, limit = 12): Track[] {
  return rankedByScore(taste, now)
    .slice(0, limit)
    .map((entry) => entry.track);
}

/** Songs that were played a lot but not for a while. */
export function getForgottenFavorites(taste: Taste, now: number, limit = 12): Track[] {
  return Object.values(taste.stats)
    .filter(
      (s) =>
        s.playCount >= FORGOTTEN_MIN_PLAYS &&
        now - s.lastPlayedAt >= FORGOTTEN_AFTER_DAYS * DAY_MS &&
        !isDisliked(taste, s.track.id)
    )
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit)
    .map((s) => s.track);
}

/**
 * Songs to base recommendations on: the top-scored played and liked tracks,
 * one per artist so the sections don't all revolve around the same artist.
 * Falls back to older favourites / recently played while the history is thin.
 */
export function pickSeeds(
  taste: Taste,
  fallbackTracks: Track[],
  now: number,
  count: number
): Track[] {
  const seeds: Track[] = [];
  const usedIds = new Set<string>();
  const usedArtists = new Set<string>();

  const ranked = [...rankedByScore(taste, now), ...unplayedFavorites(taste, now)].sort(
    (a, b) => b.score - a.score
  );
  const candidates = [...ranked.map((entry) => entry.track), ...fallbackTracks];
  for (const track of candidates) {
    if (seeds.length >= count) break;
    const artist = artistKey(track);
    if (usedIds.has(track.id) || usedArtists.has(artist) || isDisliked(taste, track.id)) {
      continue;
    }
    usedIds.add(track.id);
    usedArtists.add(artist);
    seeds.push(track);
  }

  return seeds;
}

/** Round-robin over the seeds' radios: a blend of everything the user is into. */
export function buildQuickPicks(
  seeds: Track[],
  radios: Track[][],
  taste: Taste,
  limit = 20
): Track[] {
  const seedIds = new Set(seeds.map((s) => s.id));
  const picked: Track[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...radios.map((r) => r.length));

  for (let i = 0; i < longest && picked.length < limit; i++) {
    for (const radio of radios) {
      const track = radio[i];
      if (!track || seen.has(track.id) || seedIds.has(track.id) || isDisliked(taste, track.id)) {
        continue;
      }
      seen.add(track.id);
      picked.push(track);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export function buildMix(seed: Track, radio: Track[], taste: Taste, limit = 30): Mix {
  const tracks = [
    seed,
    ...radio.filter((t) => t.id !== seed.id && !isDisliked(taste, t.id)),
  ].slice(0, limit);

  const artists: string[] = [];
  for (const track of tracks) {
    const name = primaryArtist(track.artist);
    if (name && !artists.some((a) => a.toLowerCase() === name.toLowerCase())) {
      artists.push(name);
    }
    if (artists.length === 3) break;
  }

  return {
    id: `mix-${seed.id}`,
    title: `${primaryArtist(seed.artist) || seed.title} Mix`,
    subtitle: artists.join(', '),
    coverUrl: seed.thumbnailUrl,
    tracks,
  };
}

/** The most recently played song that isn't already covered by a mix. */
export function pickRecentSeed(taste: Taste, excluded: Track[]): Track | null {
  const excludedIds = new Set(excluded.map((t) => t.id));
  const excludedArtists = new Set(excluded.map(artistKey));

  const recent = Object.values(taste.stats)
    .filter(
      (s) =>
        s.playCount > 0 &&
        !isDisliked(taste, s.track.id) &&
        !excludedIds.has(s.track.id) &&
        !excludedArtists.has(artistKey(s.track))
    )
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0];

  return recent?.track ?? null;
}

export function buildBecauseYouListened(
  seed: Track,
  radio: Track[],
  taste: Taste,
  limit = 15
): BecauseYouListened {
  return {
    seed,
    tracks: radio
      .filter((t) => t.id !== seed.id && !isDisliked(taste, t.id))
      .slice(0, limit),
  };
}

/**
 * Songs from a radio to append to a queue that is running out: not already
 * queued, not disliked, and not heard in the last couple of hours.
 */
export function pickRadioContinuation(
  radio: Track[],
  queue: Track[],
  taste: Taste,
  now: number,
  limit = 20
): Track[] {
  const excluded = new Set(queue.map((t) => t.id));
  const picked: Track[] = [];

  for (const track of radio) {
    if (picked.length >= limit) break;
    if (excluded.has(track.id) || isDisliked(taste, track.id)) continue;
    const stats = taste.stats[track.id];
    if (stats?.playCount > 0 && now - stats.lastPlayedAt < RECENT_REPEAT_MS) continue;
    excluded.add(track.id);
    picked.push(track);
  }

  return picked;
}
