import NetInfo from '@react-native-community/netinfo';
import { useLibraryStore } from '../stores/libraryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useDownloadStore } from '../stores/downloadStore';
import { getDownloadBlockReason } from './downloadManager';

// ─── Auto-download liked songs ──────────────────────────────────────
// With the setting on, every liked song that isn't on the device yet is
// downloaded, one at a time. Nothing is attempted while downloads are blocked
// (offline, or on mobile data with "Wi-Fi only"); the sync runs again when
// the connection changes.

let isSyncing = false;
let syncRequestedWhileRunning = false;

/** Songs already tried this session, so a song that fails isn't retried in a loop. */
const attempted = new Set<string>();

function nextTrackToDownload() {
  const { favorites, isDownloaded } = useLibraryStore.getState();
  const { activeDownloads } = useDownloadStore.getState();
  return favorites.find(
    (track) =>
      !attempted.has(track.id) &&
      !isDownloaded(track.id) &&
      activeDownloads[track.id]?.status !== 'downloading'
  );
}

/** Download the liked songs that are missing. Safe to call at any time. */
export async function syncFavoriteDownloads(): Promise<void> {
  if (!useSettingsStore.getState().autoDownloadFavorites) return;
  if (isSyncing) {
    syncRequestedWhileRunning = true;
    return;
  }

  isSyncing = true;
  try {
    do {
      syncRequestedWhileRunning = false;

      for (let track = nextTrackToDownload(); track; track = nextTrackToDownload()) {
        const { autoDownloadFavorites, downloadOverWifiOnly } = useSettingsStore.getState();
        if (!autoDownloadFavorites) return;
        // Wait for a usable connection instead of marking every song as failed
        if (await getDownloadBlockReason(downloadOverWifiOnly)) return;

        attempted.add(track.id);
        await useDownloadStore.getState().startDownload(track);
      }
    } while (syncRequestedWhileRunning);
  } finally {
    isSyncing = false;
  }
}

function retryAll(): void {
  attempted.clear();
  syncFavoriteDownloads();
}

/** Keep liked songs downloaded for as long as the app runs. Returns a stop function. */
export function startAutoDownload(): () => void {
  const unsubscribeLibrary = useLibraryStore.subscribe((state, previous) => {
    if (state.favorites !== previous.favorites && state.favorites.length > previous.favorites.length) {
      syncFavoriteDownloads();
    }
  });

  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    const turnedOn = state.autoDownloadFavorites && !previous.autoDownloadFavorites;
    const mobileDataAllowed = !state.downloadOverWifiOnly && previous.downloadOverWifiOnly;
    if (turnedOn || (state.autoDownloadFavorites && mobileDataAllowed)) retryAll();
  });

  // Also fires once with the current state, which starts the first sync.
  // NetInfo repeats events for the same connection, so only a change counts.
  let lastConnection = '';
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    const connection = state.isConnected ? state.type : '';
    if (connection === lastConnection) return;
    lastConnection = connection;
    if (connection) retryAll();
  });

  return () => {
    unsubscribeLibrary();
    unsubscribeSettings();
    unsubscribeNetwork();
  };
}
