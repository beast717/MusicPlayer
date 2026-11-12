import { Track } from '../../types';

const mockPrefetch = jest.fn();
let mockRadio: (id: string) => Promise<any[]> = async () => [];

// In-memory TrackPlayer with the queue semantics the store relies on
const mockTp = {
  queue: [] as any[],
  active: undefined as number | undefined,
  repeat: 0,
};

jest.mock('react-native-track-player', () => {
  const RepeatMode = { Off: 0, Track: 1, Queue: 2 };
  const TrackPlayer = {
    reset: async () => {
      mockTp.queue = [];
      mockTp.active = undefined;
    },
    setRepeatMode: async (mode: number) => {
      mockTp.repeat = mode;
      return mode;
    },
    add: async (tracks: any, before?: number) => {
      const list = Array.isArray(tracks) ? tracks : [tracks];
      if (before == null) {
        mockTp.queue.push(...list);
      } else {
        mockTp.queue.splice(before, 0, ...list);
        if (mockTp.active != null && before <= mockTp.active) mockTp.active += list.length;
      }
      if (mockTp.active == null && mockTp.queue.length) mockTp.active = 0;
    },
    remove: async (indexes: number | number[]) => {
      const list = (Array.isArray(indexes) ? indexes : [indexes]).sort((a, b) => b - a);
      for (const i of list) {
        if (i === mockTp.active) throw new Error('removed the active track');
        mockTp.queue.splice(i, 1);
        if (mockTp.active != null && i < mockTp.active) mockTp.active--;
      }
    },
    removeUpcomingTracks: async () => {
      mockTp.queue.splice((mockTp.active ?? -1) + 1);
    },
    skip: async (index: number) => {
      mockTp.active = index;
    },
    play: async () => {},
    seekTo: async () => {},
    getActiveTrackIndex: async () => mockTp.active,
    getQueue: async () => mockTp.queue.slice(),
  };
  return { __esModule: true, default: TrackPlayer, RepeatMode };
});

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

jest.mock('../../services/downloadManager', () => ({
  withCurrentLocalPaths: (t: unknown) => t,
}));

jest.mock('../../services/trackPlayerHelpers', () => ({
  PLACEHOLDER_URL: 'https://placeholder.invalid',
  getLocalTrackSource: () => null,
  resolveTrackSource: async (t: { id: string }) => ({ url: `https://stream/${t.id}` }),
  toTrackPlayerTrack: (t: { id: string }, s: object) => ({ id: t.id, ...s }),
  prefetchStreams: (...args: unknown[]) => mockPrefetch(...args),
}));

jest.mock('../../services/youtubeMusic', () => ({
  getRadioTracks: (id: string) => mockRadio(id),
}));

import { usePlayerStore, getUpcomingTracks } from '../playerStore';
import { useHistoryStore } from '../historyStore';
import { useSettingsStore } from '../settingsStore';

const PLACEHOLDER_URL = 'https://placeholder.invalid';
const RepeatMode = { Off: 0, Track: 1, Queue: 2 };

const tracks: Track[] = Array.from({ length: 10 }, (_, i) => ({
  id: `t${i}`,
  title: `T${i}`,
  artist: 'A',
  duration: 1,
  thumbnailUrl: '',
}));

const tpIds = () => mockTp.queue.map((t) => t.id);
const storeIds = () => usePlayerStore.getState().queue.map((t) => t.id);
const state = () => usePlayerStore.getState();

// toggleShuffle releases its reorder lock on a 100ms timer
const waitForReorderLock = () => new Promise((r) => setTimeout(r, 150));

// Let fire-and-forget work (the radio extension) finish
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(async () => {
  await waitForReorderLock();
  await flush();
  mockRadio = async () => [];
  useHistoryStore.getState().clearHistory();
  useSettingsStore.setState({ keepPlayingSimilar: true });
  usePlayerStore.setState({ shuffleMode: 'off', repeatMode: 'off' });
});

describe('playQueue', () => {
  it('keeps order and resolves only the starting track when shuffle is off', async () => {
    await state().playQueue(tracks, 3);

    expect(tpIds()).toEqual(tracks.map((t) => t.id));
    expect(mockTp.active).toBe(3);
    expect(mockTp.queue[3].url).toBe('https://stream/t3');
    expect(mockTp.queue[4].url).toBe(PLACEHOLDER_URL);
  });

  it('plays the chosen track first and shuffles the rest when shuffle is on', async () => {
    usePlayerStore.setState({ shuffleMode: 'on' });
    await state().playQueue(tracks, 5);

    expect(mockTp.active).toBe(0);
    expect(tpIds()[0]).toBe('t5');
    expect(new Set(tpIds()).size).toBe(10);
    expect(storeIds()).toEqual(tpIds());
    expect(state().originalQueue).toEqual(tracks);
  });
});

describe('toggleShuffle', () => {
  it('reorders around the playing track and restores the original order', async () => {
    await state().playQueue(tracks, 3);

    await state().toggleShuffle();
    expect(state().shuffleMode).toBe('on');
    expect(mockTp.active).toBe(0);
    expect(mockTp.queue[0]).toMatchObject({ id: 't3', url: 'https://stream/t3' });
    expect(new Set(tpIds()).size).toBe(10);
    expect(storeIds()).toEqual(tpIds());
    expect(state().currentTrack?.id).toBe('t3');

    // Move on to a later (resolved) track, then turn shuffle off
    await waitForReorderLock();
    mockTp.active = 2;
    const playing = mockTp.queue[2].id;
    mockTp.queue[2] = { ...mockTp.queue[2], url: `https://stream/${playing}` };

    await state().toggleShuffle();
    expect(state().shuffleMode).toBe('off');
    expect(tpIds()).toEqual(tracks.map((t) => t.id));
    expect(mockTp.queue[mockTp.active!].id).toBe(playing);
    expect(storeIds()).toEqual(tpIds());
  });

  it('ignores the toggle while the playing track is still a placeholder', async () => {
    await state().playQueue(tracks, 0);
    mockTp.active = 4; // skipped to an unresolved track

    await state().toggleShuffle();

    expect(state().shuffleMode).toBe('off');
    expect(tpIds()).toEqual(tracks.map((t) => t.id));
  });

  it('only flips the mode when there is nothing to reorder', async () => {
    await state().playTrack(tracks[0]);

    await state().toggleShuffle();

    expect(state().shuffleMode).toBe('on');
    expect(tpIds()).toEqual(['t0']);
  });
});

describe('shufflePlay', () => {
  it('turns shuffle on and starts at index 0 of a shuffled queue', async () => {
    await state().shufflePlay(tracks);

    expect(state().shuffleMode).toBe('on');
    expect(mockTp.active).toBe(0);
    expect(mockTp.queue).toHaveLength(10);
    expect(storeIds()).toEqual(tpIds());
  });
});

describe('repeat mode', () => {
  it('is re-applied to the player after a queue reset', async () => {
    usePlayerStore.setState({ repeatMode: 'queue' });
    mockTp.repeat = RepeatMode.Off;

    await state().playTrack(tracks[0]);

    expect(mockTp.repeat).toBe(RepeatMode.Queue);
  });

  it('cycles off → queue → track → off and syncs the player', async () => {
    await state().cycleRepeatMode();
    expect([state().repeatMode, mockTp.repeat]).toEqual(['queue', RepeatMode.Queue]);
    await state().cycleRepeatMode();
    expect([state().repeatMode, mockTp.repeat]).toEqual(['track', RepeatMode.Track]);
    await state().cycleRepeatMode();
    expect([state().repeatMode, mockTp.repeat]).toEqual(['off', RepeatMode.Off]);
  });
});

describe('upcoming tracks', () => {
  it('prefetches the next track when a queue starts', async () => {
    mockPrefetch.mockClear();
    await state().playQueue(tracks, 3);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPrefetch).toHaveBeenCalledWith([tracks[4]]);
  });

  it('stops at the end of the queue unless the whole queue repeats', async () => {
    await state().playQueue(tracks, 8);

    expect((await getUpcomingTracks(3)).map((t) => t.id)).toEqual(['t9']);

    usePlayerStore.setState({ repeatMode: 'queue' });
    expect((await getUpcomingTracks(3)).map((t) => t.id)).toEqual(['t9', 't0', 't1']);
  });

  it('has nothing upcoming for a single track', async () => {
    await state().playTrack(tracks[0]);

    expect(await getUpcomingTracks(5)).toEqual([]);
  });
});

describe('keep playing similar songs', () => {
  const song = (id: string): Track => ({ id, title: id, artist: `Artist ${id}`, duration: 1, thumbnailUrl: '' });
  const radioOf = (id: string) => [song(id), ...Array.from({ length: 5 }, (_, i) => song(`${id}-r${i}`))];

  it('lines up similar songs after a single song, as placeholders resolved later', async () => {
    const asked: string[] = [];
    mockRadio = async (id) => {
      asked.push(id);
      return radioOf(id);
    };

    await state().playTrack(song('seed'));
    await flush();

    const expected = ['seed', 'seed-r0', 'seed-r1', 'seed-r2', 'seed-r3', 'seed-r4'];
    expect(asked).toEqual(['seed']);
    expect(storeIds()).toEqual(expected);
    expect(tpIds()).toEqual(expected);
    expect(state().originalQueue.map((t) => t.id)).toEqual(expected);
    expect(mockTp.queue.slice(1).every((t) => t.url === PLACEHOLDER_URL)).toBe(true);
    expect(state().autoQueuedIds).toEqual(expected.slice(1));
  });

  it('waits until at most two songs are left', async () => {
    const radio = jest.fn(async (id: string) => radioOf(id));
    mockRadio = radio;

    await state().playQueue(tracks, 5);
    await flush();
    expect(radio).not.toHaveBeenCalled();
    expect(await state().continueWithSimilar()).toBe(false);

    mockTp.active = 7;
    expect(await state().continueWithSimilar()).toBe(true);
    expect(radio).toHaveBeenCalledWith('t7');
    expect(storeIds()).toHaveLength(15);
    expect(tpIds()).toEqual(storeIds());
  });

  it('does nothing while repeating or when turned off', async () => {
    const radio = jest.fn(async (id: string) => radioOf(id));
    mockRadio = radio;

    usePlayerStore.setState({ repeatMode: 'queue' });
    await state().playTrack(song('a'));
    await flush();
    usePlayerStore.setState({ repeatMode: 'off' });
    useSettingsStore.setState({ keepPlayingSimilar: false });
    expect(await state().continueWithSimilar()).toBe(false);

    expect(radio).not.toHaveBeenCalled();
    expect(storeIds()).toEqual(['a']);
  });

  it('leaves out queued, disliked and just-heard songs', async () => {
    useHistoryStore.getState().markNotInterested('seed-r0');
    useHistoryStore.getState().recordPlay(song('seed-r1'));
    useHistoryStore.getState().recordPlay(song('seed-r2'), Date.now() - 3 * 60 * 60 * 1000);
    mockRadio = async (id) => [...radioOf(id), song('seed')];

    await state().playTrack(song('seed'));
    await flush();

    expect(storeIds()).toEqual(['seed', 'seed-r2', 'seed-r3', 'seed-r4']);
  });

  it("falls back to the last queued song's radio, and gives up quietly offline", async () => {
    await state().playQueue([song('x'), song('y')], 0);
    await flush();

    mockRadio = async (id) => {
      if (id === 'x') throw new Error('offline');
      return radioOf(id);
    };
    expect(await state().continueWithSimilar()).toBe(true);
    expect(storeIds()).toEqual(['x', 'y', 'y-r0', 'y-r1', 'y-r2', 'y-r3', 'y-r4']);

    mockTp.active = 6;
    mockRadio = async () => {
      throw new Error('offline');
    };
    expect(await state().continueWithSimilar()).toBe(false);
    expect(storeIds()).toHaveLength(7);
  });

  it('drops the radio when a new queue starts while it loads', async () => {
    let release!: () => void;
    mockRadio = (id) => new Promise((resolve) => (release = () => resolve(radioOf(id))));

    await state().playTrack(song('old'));
    mockRadio = async () => [];
    await state().playQueue(tracks, 0);
    release();
    await flush();

    expect(storeIds()).toEqual(tracks.map((t) => t.id));
    expect(tpIds()).toEqual(storeIds());
    expect(state().autoQueuedIds).toEqual([]);
  });

  it('lets shuffle work while similar songs load, and stays in sync', async () => {
    let release!: () => void;
    mockRadio = (id) => new Promise((resolve) => (release = () => resolve(radioOf(id))));

    await state().playQueue([song('a'), song('b'), song('c')], 0);
    await flush();
    await state().toggleShuffle();
    expect(state().shuffleMode).toBe('on');
    expect(storeIds()[0]).toBe('a');

    release();
    await waitForReorderLock();
    await flush();
    expect(storeIds()).toHaveLength(8);
    expect(storeIds().slice(3)).toEqual(['a-r0', 'a-r1', 'a-r2', 'a-r3', 'a-r4']);
    expect(tpIds()).toEqual(storeIds());
  });
});
