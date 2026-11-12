export interface Track {
  id: string; // YouTube video ID
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnailUrl: string;
  /** YouTube Music channel ID of the main artist, when the source provided it. */
  artistId?: string;
  localFilePath?: string; // set if downloaded
  localThumbnailPath?: string;
  addedAt?: number; // timestamp
}

export interface SearchResult {
  videoId: string;
  title: string;
  uploaderName: string;
  uploaderUrl?: string;
  thumbnailUrl: string;
  duration: number; // seconds
  views?: number;
  uploadedDate?: string;
}

export interface AudioStream {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
  codec: string;
  streamType: 'default' | 'hls';
  /** Size in bytes, when known (0 or undefined otherwise). */
  contentLength?: number;
}

export interface ResolvedAudioSource {
  url: string;
  mimeType: string;
  streamType: 'default' | 'hls';
  /** Size in bytes, when known. Needed to stream through the local proxy. */
  contentLength?: number;
}
