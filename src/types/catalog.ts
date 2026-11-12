import { Track } from './track';

// What YouTube Music's catalogue returns for search results and artist,
// album and playlist pages.

export interface ArtistSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  /** e.g. "353M monthly audience" */
  subtitle?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  /** e.g. "Album • Adele • 2011" */
  subtitle: string;
  thumbnailUrl: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  subtitle: string;
  thumbnailUrl: string;
}

export interface ArtistPage {
  id: string;
  name: string;
  thumbnailUrl: string;
  subtitle?: string;
  topSongs: Track[];
  /** Playlist with all of the artist's songs, when YouTube Music offers one. */
  allSongsPlaylistId?: string;
  albums: AlbumSummary[];
  singles: AlbumSummary[];
  related: ArtistSummary[];
}

/** An album or a YouTube / YouTube Music playlist. */
export interface Collection {
  kind: 'album' | 'playlist';
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  artistId?: string;
  artistName?: string;
  tracks: Track[];
  /** The playlist has more tracks than were loaded. */
  isTruncated?: boolean;
}
