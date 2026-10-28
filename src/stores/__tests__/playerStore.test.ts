import { Track } from '../../types';

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
}));

import { usePlayerStore } from '../playerStore';

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

beforeEach(async () => {
  await waitForReorderLock();
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
