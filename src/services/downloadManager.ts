import * as FileSystem from 'expo-file-system/legacy';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import { Track } from '../types';
import { getAudioStreamUrl } from './youtube';

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}thumbnails/`;
// In-progress files live in the cache dir so an interrupted download never
// leaves a half-written file in the downloads folder.
const PARTIAL_DIR = `${FileSystem.cacheDirectory}partial-downloads/`;

// Ensure directories exist
async function ensureDirectories(): Promise<void> {
  for (const dir of [DOWNLOADS_DIR, THUMBNAILS_DIR, PARTIAL_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

export interface DownloadProgress {
  videoId: string;
  progress: number; // 0-1
  totalBytes: number;
  downloadedBytes: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

// ─── Cancellation ───────────────────────────────────────────────────

interface DownloadHandle {
  cancelled: boolean;
  resumable?: FileSystem.DownloadResumable;
}

const activeHandles = new Map<string, DownloadHandle>();

const CANCELLED_ERROR_NAME = 'DownloadCancelledError';

function throwIfCancelled(handle: DownloadHandle): void {
  if (handle.cancelled) {
    const err = new Error('Download cancelled');
    err.name = CANCELLED_ERROR_NAME;
    throw err;
  }
}

export function isDownloadCancelledError(err: unknown): boolean {
  return err instanceof Error && err.name === CANCELLED_ERROR_NAME;
}

/** Stop an in-progress download. The pending downloadTrack call rejects with a cancelled error. */
export async function cancelDownload(videoId: string): Promise<void> {
  const handle = activeHandles.get(videoId);
  if (!handle) return;
  handle.cancelled = true;
  activeHandles.delete(videoId);
  if (handle.resumable) {
    try {
      await handle.resumable.cancelAsync();
    } catch (err) {
      console.warn('Failed to cancel download:', err);
    }
  }
}

// ─── Network policy ─────────────────────────────────────────────────

/** Returns a user-facing reason the download can't start now, or null if it can. */
export async function getDownloadBlockReason(wifiOnly: boolean): Promise<string | null> {
  const state = await NetInfo.fetch();
  if (state.isConnected === false || state.type === NetInfoStateType.none) {
    return 'No internet connection.';
  }
  const onWifi =
    state.type === NetInfoStateType.wifi || state.type === NetInfoStateType.ethernet;
  if (wifiOnly && !onWifi) {
    return 'Downloads are set to Wi-Fi only. Connect to Wi-Fi or turn off "Download over Wi-Fi only" in Settings.';
  }
  return null;
}

// ─── Download ───────────────────────────────────────────────────────

export async function downloadTrack(
  track: Track,
  onProgress?: DownloadProgressCallback
): Promise<{ filePath: string; thumbnailPath?: string }> {
  const handle: DownloadHandle = { cancelled: false };
  activeHandles.set(track.id, handle);

  const partialPath = `${PARTIAL_DIR}${track.id}-${Date.now()}.m4a`;

  try {
    await ensureDirectories();

    // Get stream URL
    const streamUrl = await getAudioStreamUrl(track.id);
    throwIfCancelled(handle);

    // Download audio
    handle.resumable = FileSystem.createDownloadResumable(
      streamUrl,
      partialPath,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        onProgress?.({
          videoId: track.id,
          progress: isNaN(progress) ? 0 : progress,
          totalBytes: downloadProgress.totalBytesExpectedToWrite,
          downloadedBytes: downloadProgress.totalBytesWritten,
        });
      }
    );

    const downloadResult = await handle.resumable.downloadAsync();
    throwIfCancelled(handle);

    if (!downloadResult) {
      throw new Error('Download failed: no response from server');
    }
    if (downloadResult.status >= 400) {
      throw new Error(`Download failed: server returned ${downloadResult.status}`);
    }

    // Validate the download actually produced a real audio file
    const fileInfo = await FileSystem.getInfoAsync(partialPath);
    if (!fileInfo.exists || !('size' in fileInfo) || (fileInfo.size ?? 0) < 10000) {
      // File is missing or too small (likely an error page, not audio)
      throw new Error('Download failed: file is empty or invalid');
    }
    throwIfCancelled(handle);

    const filePath = getLocalFilePath(track.id);
    await FileSystem.deleteAsync(filePath, { idempotent: true });
    await FileSystem.moveAsync({ from: partialPath, to: filePath });

    // Download thumbnail
    let thumbnailPath: string | undefined;
    if (track.thumbnailUrl) {
      const targetPath = getLocalThumbnailPath(track.id);
      try {
        const thumbResult = await FileSystem.downloadAsync(track.thumbnailUrl, targetPath);
        if (thumbResult.status < 400) {
          thumbnailPath = targetPath;
        } else {
          await FileSystem.deleteAsync(targetPath, { idempotent: true });
        }
      } catch (err) {
        console.warn('Failed to download thumbnail:', err);
      }
    }

    return { filePath, thumbnailPath };
  } catch (err) {
    try {
      await FileSystem.deleteAsync(partialPath, { idempotent: true });
    } catch {}
    throw err;
  } finally {
    if (activeHandles.get(track.id) === handle) {
      activeHandles.delete(track.id);
    }
  }
}

export async function deleteDownload(videoId: string): Promise<void> {
  const filePath = getLocalFilePath(videoId);
  const thumbnailPath = getLocalThumbnailPath(videoId);

  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(filePath);
    }
  } catch (err) {
    console.warn('Failed to delete audio file:', err);
  }

  try {
    const thumbInfo = await FileSystem.getInfoAsync(thumbnailPath);
    if (thumbInfo.exists) {
      await FileSystem.deleteAsync(thumbnailPath);
    }
  } catch (err) {
    console.warn('Failed to delete thumbnail:', err);
  }
}

export async function getDownloadedFileSize(videoId: string): Promise<number> {
  const filePath = getLocalFilePath(videoId);
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists && 'size' in info ? (info.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function getTotalDownloadsSize(): Promise<number> {
  await ensureDirectories();
  try {
    const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
    const sizes = await Promise.all(
      files.map(async (file) => {
        const info = await FileSystem.getInfoAsync(`${DOWNLOADS_DIR}${file}`);
        return info.exists && 'size' in info ? (info.size ?? 0) : 0;
      })
    );
    return sizes.reduce((total, size) => total + size, 0);
  } catch {
    return 0;
  }
}

export async function clearAllDownloads(): Promise<void> {
  try {
    await FileSystem.deleteAsync(DOWNLOADS_DIR, { idempotent: true });
    await FileSystem.deleteAsync(THUMBNAILS_DIR, { idempotent: true });
    await ensureDirectories();
  } catch (err) {
    console.warn('Failed to clear downloads:', err);
  }
}

export function getLocalFilePath(videoId: string): string {
  return `${DOWNLOADS_DIR}${videoId}.m4a`;
}

export function getLocalThumbnailPath(videoId: string): string {
  return `${THUMBNAILS_DIR}${videoId}.jpg`;
}

/**
 * Rebuild a track's local paths against the current documents directory.
 * iOS changes the app container path on every reinstall (e.g. each sideload
 * refresh), so absolute paths saved earlier stop pointing at the files.
 */
export function withCurrentLocalPaths(track: Track): Track {
  if (!track.localFilePath && !track.localThumbnailPath) return track;
  return {
    ...track,
    localFilePath: track.localFilePath ? getLocalFilePath(track.id) : undefined,
    localThumbnailPath: track.localThumbnailPath
      ? getLocalThumbnailPath(track.id)
      : undefined,
  };
}
