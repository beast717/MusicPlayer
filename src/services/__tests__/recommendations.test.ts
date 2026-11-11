import {
  primaryArtist,
  scoreTrack,
  getListenAgain,
  getForgottenFavorites,
  pickSeeds,
  pickRecentSeed,
  buildQuickPicks,
  buildMix,
  buildBecauseYouListened,
  HistoryStats,
} from '../recommendations';
import { Track } from '../../types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const track = (id: string, artist = `Artist ${id}`): Track => ({
  id,
  title: `Song ${id}`,
  artist,
  duration: 200,
  thumbnailUrl: `https://img/${id}`,
});

function history(
  entries: [Track, { plays?: number; skips?: number; daysAgo?: number }][]
): HistoryStats {
  const stats: HistoryStats = {};
  for (const [t, { plays = 1, skips = 0, daysAgo = 0 }] of entries) {
    stats[t.id] = {
      track: t,
      playCount: plays,
      skipCount: skips,
      firstPlayedAt: NOW - 100 * DAY,
      lastPlayedAt: NOW - daysAgo * DAY,
    };
  }
  return stats;
}

describe('primaryArtist', () => {
  it.each([
    ['Luis Fonsi & Daddy Yankee', 'Luis Fonsi'],
    ['Luis Fonsi, Sean Paul & R3HAB', 'Luis Fonsi'],
    ['Drake feat. Rihanna', 'Drake'],
    ['Queen - Topic', 'Queen'],
    ['LuisFonsiVEVO', 'LuisFonsi'],
    ['Xavier Rudd', 'Xavier Rudd'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(primaryArtist(input)).toBe(expected);
  });
});

describe('scoreTrack', () => {
  it('halves the weight of plays every 30 days and penalises skips', () => {
    const [fresh, old, skipped] = Object.values(
      history([
        [track('fresh'), { plays: 4 }],
        [track('old'), { plays: 4, daysAgo: 30 }],
        [track('skipped'), { plays: 4, skips: 4 }],
      ])
    );

    expect(scoreTrack(fresh, NOW)).toBeCloseTo(4);
    expect(scoreTrack(old, NOW)).toBeCloseTo(2);
    expect(scoreTrack(skipped, NOW)).toBeCloseTo(2);
  });
});

describe('getListenAgain', () => {
  it('ranks by plays and recency, and leaves out tracks that were only skipped', () => {
    const stats = history([
      [track('a'), { plays: 3, daysAgo: 60 }],
      [track('b'), { plays: 2 }],
      [track('c'), { plays: 10, daysAgo: 1 }],
      [track('skipOnly'), { plays: 0, skips: 3 }],
    ]);

    expect(getListenAgain(stats, NOW).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('getForgottenFavorites', () => {
  it('returns well-played tracks that have not been heard for 3 weeks', () => {
    const stats = history([
      [track('forgotten'), { plays: 5, daysAgo: 40 }],
      [track('recent'), { plays: 9, daysAgo: 2 }],
      [track('barelyPlayed'), { plays: 1, daysAgo: 90 }],
    ]);

    expect(getForgottenFavorites(stats, NOW).map((t) => t.id)).toEqual(['forgotten']);
  });
});

describe('pickSeeds', () => {
  it('takes the top tracks but only one per artist', () => {
    const stats = history([
      [track('a1', 'Adele'), { plays: 9 }],
      [track('a2', 'Adele & Someone'), { plays: 8 }],
      [track('b1', 'Burna Boy'), { plays: 5 }],
      [track('c1', 'Coldplay'), { plays: 2 }],
    ]);

    expect(pickSeeds(stats, [], NOW, 3).map((t) => t.id)).toEqual(['a1', 'b1', 'c1']);
  });

  it('falls back to favourites / recents when history is thin', () => {
    const stats = history([[track('a1', 'Adele'), { plays: 1 }]]);
    const fallback = [track('a1', 'Adele'), track('f1', 'Fela Kuti'), track('f2', 'Fela Kuti')];

    expect(pickSeeds(stats, fallback, NOW, 5).map((t) => t.id)).toEqual(['a1', 'f1']);
  });

  it('never seeds from a track the user keeps skipping', () => {
    const stats = history([[track('x'), { plays: 0, skips: 3 }]]);

    expect(pickSeeds(stats, [track('x')], NOW, 5)).toEqual([]);
  });
});

describe('buildQuickPicks', () => {
  it('interleaves the radios, without seeds, duplicates or disliked tracks', () => {
    const seedA = track('seedA');
    const seedB = track('seedB');
    const stats = history([[track('hated'), { plays: 0, skips: 2 }]]);
    const radios = [
      [seedA, track('a1'), track('shared'), track('a3')],
      [seedB, track('b1'), track('hated'), track('shared'), seedA],
    ];

    const picks = buildQuickPicks([seedA, seedB], radios, stats);

    expect(picks.map((t) => t.id)).toEqual(['a1', 'b1', 'shared', 'a3']);
  });

  it('respects the limit', () => {
    const radio = Array.from({ length: 50 }, (_, i) => track(`r${i}`));
    expect(buildQuickPicks([], [radio], {}, 20)).toHaveLength(20);
  });
});

describe('buildMix', () => {
  it('starts with the seed and names the mix after its artist', () => {
    const seed = track('seed', 'Daddy Yankee & Snow');
    const radio = [seed, track('r1', 'Shakira'), track('r2', 'Daddy Yankee'), track('r3', 'KAROL G')];

    const mix = buildMix(seed, radio, {});

    expect(mix).toMatchObject({
      id: 'mix-seed',
      title: 'Daddy Yankee Mix',
      subtitle: 'Daddy Yankee, Shakira, KAROL G',
      coverUrl: 'https://img/seed',
    });
    expect(mix.tracks.map((t) => t.id)).toEqual(['seed', 'r1', 'r2', 'r3']);
  });
});

describe('because you listened to', () => {
  it('picks the most recent played track not already covered by a mix', () => {
    const stats = history([
      [track('seed', 'Adele'), { plays: 9, daysAgo: 0 }],
      [track('sameArtist', 'Adele'), { plays: 1, daysAgo: 1 }],
      [track('recent', 'Burna Boy'), { plays: 1, daysAgo: 2 }],
      [track('older', 'Coldplay'), { plays: 1, daysAgo: 5 }],
      [track('skipped', 'Drake'), { plays: 0, skips: 1, daysAgo: 0 }],
    ]);

    expect(pickRecentSeed(stats, [track('seed', 'Adele')])?.id).toBe('recent');
    expect(pickRecentSeed({}, [])).toBeNull();
  });

  it('lists the radio without the seed itself', () => {
    const seed = track('seed');
    const section = buildBecauseYouListened(seed, [seed, track('r1'), track('r2')], {});

    expect(section.seed).toBe(seed);
    expect(section.tracks.map((t) => t.id)).toEqual(['r1', 'r2']);
  });
});
