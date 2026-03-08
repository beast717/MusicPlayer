export interface Track {
  id: string; // YouTube video ID
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnailUrl: string;
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
}

export interface ResolvedAudioSource {
  url: string;
  mimeType: string;
  streamType: 'default' | 'hls';
}
