import * as FileSystem from 'expo-file-system/legacy';
import { Track } from '../types';
import { getAudioStreamUrl } from './youtube';

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}downloads/`;
const THUMBNAILS_DIR = `${FileSystem.documentDirectory}thumbnails/`;

// Ensure directories exist
async function ensureDirectories(): Promise<void> {
  const downloadsInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
  if (!downloadsInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
  const thumbsInfo = await FileSystem.getInfoAsync(THUMBNAILS_DIR);
  if (!thumbsInfo.exists) {
    await FileSystem.makeDirectoryAsync(THUMBNAILS_DIR, { intermediates: true });
  }
}

export interface DownloadProgress {
  videoId: string;
  progress: number; // 0-1
  totalBytes: number;
  downloadedBytes: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

export async function downloadTrack(
  track: Track,
  onProgress?: DownloadProgressCallback
): Promise<{ filePath: string; thumbnailPath: string }> {
  await ensureDirectories();

  // Get stream URL
  const streamUrl = await getAudioStreamUrl(track.id);

  const filePath = `${DOWNLOADS_DIR}${track.id}.m4a`;
  const thumbnailPath = `${THUMBNAILS_DIR}${track.id}.jpg`;

  // Download audio
  const downloadResumable = FileSystem.createDownloadResumable(
    streamUrl,
    filePath,
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

  await downloadResumable.downloadAsync();

  // Download thumbnail
  try {
    await FileSystem.downloadAsync(track.thumbnailUrl, thumbnailPath);
  } catch (err) {
    console.warn('Failed to download thumbnail:', err);
  }

  return { filePath, thumbnailPath };
}

export async function deleteDownload(videoId: string): Promise<void> {
  const filePath = `${DOWNLOADS_DIR}${videoId}.m4a`;
  const thumbnailPath = `${THUMBNAILS_DIR}${videoId}.jpg`;

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
  const filePath = `${DOWNLOADS_DIR}${videoId}.m4a`;
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists && 'size' in info ? ((info as any).size || 0) : 0;
  } catch {
    return 0;
  }
}

export async function getTotalDownloadsSize(): Promise<number> {
  await ensureDirectories();
  try {
    const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
    let total = 0;
    for (const file of files) {
      const info = await FileSystem.getInfoAsync(`${DOWNLOADS_DIR}${file}`);
      if (info.exists && 'size' in info) {
        total += (info as any).size || 0;
      }
    }
    return total;
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
