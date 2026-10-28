import { Track } from '../../types';

// Controllable fake of the download manager: each download waits for the test
// to resolve/reject it, like a real network transfer would.
const mockDm = {
  pending: null as null | {
    resolve: (r: { filePath: string; thumbnailPath?: string }) => void;
    reject: (e: Error) => void;
    onProgress: (p: { progress: number }) => void;
  },
  blockReason: null as string | null,
  holdNetworkCheck: false,
  releaseNetworkCheck: null as null | (() => void),
  abortOnCancel: true,
  deleted: [] as string[],
  cancelled: [] as string[],
  library: [] as string[],
};

function mockCancelledError(): Error {
  const err = new Error('Download cancelled');
  err.name = 'DownloadCancelledError';
  return err;
}

jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

jest.mock('../../services/downloadManager', () => ({
  downloadTrack: (_track: unknown, onProgress: (p: { progress: number }) => void) =>
    new Promise((resolve, reject) => {
      mockDm.pending = { resolve, reject, onProgress };
    }),
  deleteDownload: async (id: string) => {
    mockDm.deleted.push(id);
  },
  cancelDownload: async (id: string) => {
    mockDm.cancelled.push(id);
    if (mockDm.abortOnCancel) mockDm.pending?.reject(mockCancelledError());
  },
  isDownloadCancelledError: (e: Error) => e?.name === 'DownloadCancelledError',
  getDownloadBlockReason: () =>
    mockDm.holdNetworkCheck
      ? new Promise((resolve) => {
          mockDm.releaseNetworkCheck = () => resolve(mockDm.blockReason);
        })
      : Promise.resolve(mockDm.blockReason),
}));

jest.mock('../settingsStore', () => ({
  useSettingsStore: { getState: () => ({ downloadOverWifiOnly: true }) },
}));

jest.mock('../libraryStore', () => ({
  useLibraryStore: {
    getState: () => ({
      addDownloadedTrack: (t: { id: string }) => mockDm.library.push(t.id),
      isDownloaded: (id: string) => mockDm.library.includes(id),
    }),
  },
}));

import { useDownloadStore } from '../downloadStore';

const state = () => useDownloadStore.getState();
const tick = () => new Promise((r) => setImmediate(r));
const track = (id: string): Track => ({ id, title: id, artist: '', duration: 1, thumbnailUrl: '' });

beforeEach(() => {
  // Fake timers so the store's 2s "clear completed entry" timer can't outlive the test
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  useDownloadStore.setState({ activeDownloads: {} });
  Object.assign(mockDm, {
    pending: null,
    blockReason: null,
    holdNetworkCheck: false,
    releaseNetworkCheck: null,
    abortOnCancel: true,
    deleted: [],
    cancelled: [],
    library: [],
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('completes a normal download and adds it to the library', async () => {
  const p = state().startDownload(track('a'));
  await tick();
  mockDm.pending!.onProgress({ progress: 0.4 });
  expect(state().activeDownloads.a.progress).toBe(0.4);

  mockDm.pending!.resolve({ filePath: 'file:///a.m4a' });
  await p;

  expect(mockDm.library).toEqual(['a']);
  expect(state().activeDownloads.a.status).toBe('completed');

  jest.advanceTimersByTime(2000);
  expect(state().activeDownloads.a).toBeUndefined();
});

it('cancelling mid-download aborts it without leaving a failed entry', async () => {
  const p = state().startDownload(track('a'));
  await tick();
  const download = mockDm.pending!;

  state().cancelDownload('a');
  await p;

  expect(mockDm.cancelled).toEqual(['a']);
  expect(state().activeDownloads.a).toBeUndefined();
  expect(mockDm.library).toEqual([]);

  // A late progress event must not bring the entry back
  download.onProgress({ progress: 0.9 });
  expect(state().activeDownloads.a).toBeUndefined();
});

it('deletes the file when cancel arrives just after it finished saving', async () => {
  mockDm.abortOnCancel = false; // the transfer is already done, nothing to abort
  const p = state().startDownload(track('a'));
  await tick();

  state().cancelDownload('a');
  mockDm.pending!.resolve({ filePath: 'file:///a.m4a' });
  await p;

  expect(mockDm.deleted).toEqual(['a']);
  expect(mockDm.library).toEqual([]);
});

it('shows real failures as failed with the error message', async () => {
  const p = state().startDownload(track('b'));
  await tick();
  mockDm.pending!.reject(new Error('HTTP 403'));
  await p;

  expect(state().activeDownloads.b).toMatchObject({
    status: 'failed',
    error: 'HTTP 403',
    track: { id: 'b' },
  });
});

it('blocks the download with the network policy reason', async () => {
  mockDm.blockReason = 'Downloads are set to Wi-Fi only.';

  await state().startDownload(track('c'));

  expect(mockDm.pending).toBeNull();
  expect(state().activeDownloads.c).toMatchObject({
    status: 'failed',
    error: 'Downloads are set to Wi-Fi only.',
  });
});

it('cancelling during the network check never starts the transfer', async () => {
  mockDm.holdNetworkCheck = true;
  const p = state().startDownload(track('d'));
  await tick();

  state().cancelDownload('d');
  mockDm.releaseNetworkCheck!();
  await p;

  expect(mockDm.pending).toBeNull();
  expect(state().activeDownloads.d).toBeUndefined();
});
