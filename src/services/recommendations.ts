import { Track } from '../types';
import type { TrackStats } from '../stores/historyStore';

// Pure functions that turn the listening history (plus radios fetched for a
// few "seed" songs) into the home screen sections.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A play counts half as much after this many days. */
const SCORE_HALF_LIFE_DAYS = 30;
const FORGOTTEN_AFTER_DAYS = 21;
const FORGOTTEN_MIN_PLAYS = 3;

export type HistoryStats = Record<string, TrackStats>;

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

/** Higher = listened to more, and more recently. Skips pull the score down. */
export function scoreTrack(stats: TrackStats, now: number): number {
  const ageDays = Math.max(0, now - stats.lastPlayedAt) / DAY_MS;
  const decay = Math.pow(0.5, ageDays / SCORE_HALF_LIFE_DAYS);
  return (stats.playCount - 0.5 * stats.skipCount) * decay;
}

/** The user keeps skipping this track, so don't recommend it. */
function isDisliked(stats: TrackStats | undefined): boolean {
  return !!stats && stats.skipCount >= 2 && stats.skipCount > stats.playCount;
}

function rankedByScore(stats: HistoryStats, now: number): TrackStats[] {
  return Object.values(stats)
    .filter((s) => s.playCount > 0 && scoreTrack(s, now) > 0)
    .sort((a, b) => scoreTrack(b, now) - scoreTrack(a, now));
}

export function getListenAgain(stats: HistoryStats, now: number, limit = 12): Track[] {
  return rankedByScore(stats, now)
    .slice(0, limit)
    .map((s) => s.track);
}

/** Songs that were played a lot but not for a while. */
export function getForgottenFavorites(stats: HistoryStats, now: number, limit = 12): Track[] {
  return Object.values(stats)
    .filter(
      (s) =>
        s.playCount >= FORGOTTEN_MIN_PLAYS &&
        now - s.lastPlayedAt >= FORGOTTEN_AFTER_DAYS * DAY_MS &&
        !isDisliked(s)
    )
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit)
    .map((s) => s.track);
}

/**
 * Songs to base recommendations on: the top-scored tracks, one per artist so
 * the sections don't all revolve around the same artist. Falls back to
 * favourites / recently played while the history is still thin.
 */
export function pickSeeds(
  stats: HistoryStats,
  fallbackTracks: Track[],
  now: number,
  count: number
): Track[] {
  const seeds: Track[] = [];
  const usedIds = new Set<string>();
  const usedArtists = new Set<string>();

  const candidates = [...rankedByScore(stats, now).map((s) => s.track), ...fallbackTracks];
  for (const track of candidates) {
    if (seeds.length >= count) break;
    const artist = artistKey(track);
    if (usedIds.has(track.id) || usedArtists.has(artist) || isDisliked(stats[track.id])) {
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
  stats: HistoryStats,
  limit = 20
): Track[] {
  const seedIds = new Set(seeds.map((s) => s.id));
  const picked: Track[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...radios.map((r) => r.length));

  for (let i = 0; i < longest && picked.length < limit; i++) {
    for (const radio of radios) {
      const track = radio[i];
      if (!track || seen.has(track.id) || seedIds.has(track.id) || isDisliked(stats[track.id])) {
        continue;
      }
      seen.add(track.id);
      picked.push(track);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

export function buildMix(seed: Track, radio: Track[], stats: HistoryStats, limit = 30): Mix {
  const tracks = [
    seed,
    ...radio.filter((t) => t.id !== seed.id && !isDisliked(stats[t.id])),
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
export function pickRecentSeed(stats: HistoryStats, excluded: Track[]): Track | null {
  const excludedIds = new Set(excluded.map((t) => t.id));
  const excludedArtists = new Set(excluded.map(artistKey));

  const recent = Object.values(stats)
    .filter(
      (s) =>
        s.playCount > 0 &&
        !excludedIds.has(s.track.id) &&
        !excludedArtists.has(artistKey(s.track))
    )
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0];

  return recent?.track ?? null;
}

export function buildBecauseYouListened(
  seed: Track,
  radio: Track[],
  stats: HistoryStats,
  limit = 15
): BecauseYouListened {
  return {
    seed,
    tracks: radio
      .filter((t) => t.id !== seed.id && !isDisliked(stats[t.id]))
      .slice(0, limit),
  };
}
