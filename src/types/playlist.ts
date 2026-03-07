import { Track } from './track';

export interface Playlist {
  id: string;
  name: string;
  coverUrl?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}
