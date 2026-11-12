import {
  Track,
  ArtistSummary,
  AlbumSummary,
  PlaylistSummary,
  ArtistPage,
  Collection,
} from '../types';
import { ytmRequest, joinRuns, parseDuration, findArtistId } from './youtubeMusic';
import { primaryArtist } from './recommendations';

// ─── YouTube Music catalogue ────────────────────────────────────────
// Search by type, search suggestions, and artist / album / playlist pages.
// The parsers only read the fields they need and skip anything they don't
// recognise, so a layout change on YouTube's side drops items instead of
// crashing.

export type MusicSearchFilter = 'songs' | 'albums' | 'artists' | 'playlists';

/** YouTube Music's own "filter chip" parameters for the search endpoint. */
const SEARCH_PARAMS: Record<MusicSearchFilter, string> = {
  songs: 'EgWKAQIIAWoMEAMQBBAJEA4QChAF',
  albums: 'EgWKAQIYAWoMEAMQBBAJEA4QChAF',
  artists: 'EgWKAQIgAWoMEAMQBBAJEA4QChAF',
  playlists: 'EgeKAQQoAEABagwQAxAEEAkQDhAKEAU=',
};

/** Stop following a playlist's pages after this many tracks. */
export const MAX_PLAYLIST_TRACKS = 1000;

const PAGE_CACHE_TTL = 30 * 60 * 1000;
const PAGE_CACHE_SIZE = 30;

// ─── Parsing helpers ────────────────────────────────────────────────

const COVER_SIZE = 544;

/** YouTube's responses are untyped: treat anything that isn't a list as empty. */
function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function thumbnailList(container: any): { url: string }[] {
  return (
    container?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    container?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ??
    container?.thumbnails ??
    []
  );
}

/** The largest thumbnail; small square covers are requested at a usable size instead. */
function bestThumbnail(container: any): string {
  const thumbnails = thumbnailList(container);
  const url: string = thumbnails[thumbnails.length - 1]?.url ?? '';
  return url.replace(/=w(\d+)-h(\d+)(?=-|$)/, (match, width, height) =>
    width === height && Number(width) < COVER_SIZE
      ? `=w${COVER_SIZE}-h${COVER_SIZE}`
      : match
  );
}

/** Artist headers are wide banners; ask the image server for a square crop. */
function squareThumbnail(container: any): string {
  return bestThumbnail(container).replace(
    /=w\d+-h\d+(?=-|$)/,
    `=w${COVER_SIZE}-h${COVER_SIZE}`
  );
}

function columnRuns(item: any, index: number): any[] {
  return asArray(
    item?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
  );
}

function browseTarget(endpoint: any): { id: string; pageType: string } | null {
  const browse = endpoint?.browseEndpoint;
  if (!browse?.browseId) return null;
  return {
    id: browse.browseId,
    pageType:
      browse.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType ?? '',
  };
}

function stripPlaylistPrefix(browseId: string): string {
  return browseId.startsWith('VL') ? browseId.slice(2) : browseId;
}

const SEPARATOR = ' • ';
const DURATION_PATTERN = /^\d+(:\d{2}){1,2}$/;

interface TrackFallback {
  artist?: string;
  artistId?: string;
  thumbnailUrl?: string;
}

/**
 * A song row from search results or an artist / album / playlist page.
 * Returns null for rows that can't be played (no video ID, greyed out).
 */
function parseTrackItem(item: any, fallback: TrackFallback = {}): Track | null {
  if (!item) return null;
  if (item.musicItemRendererDisplayPolicy === 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT') {
    return null;
  }

  const titleRuns = columnRuns(item, 0);
  const id: string | undefined =
    item.playlistItemData?.videoId ??
    titleRuns[0]?.navigationEndpoint?.watchEndpoint?.videoId;
  const title = joinRuns(titleRuns);
  if (!id || !title) return null;

  // "Artist & Other • Album • 4:46": the artists are everything before the first separator
  const byline = columnRuns(item, 1);
  const separatorIndex = byline.findIndex((run) => run.text === SEPARATOR);
  const artistRuns = separatorIndex === -1 ? byline : byline.slice(0, separatorIndex);
  const artist = joinRuns(artistRuns) || fallback.artist || '';
  const artistId = findArtistId(artistRuns) ?? fallback.artistId;

  const fixedDuration = joinRuns(
    item.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs
  );
  const bylineDuration = byline.find((run) => DURATION_PATTERN.test(run.text))?.text;

  return {
    id,
    title,
    artist,
    duration: parseDuration(fixedDuration || bylineDuration),
    thumbnailUrl:
      bestThumbnail(item.thumbnail) ||
      fallback.thumbnailUrl ||
      `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    ...(artistId ? { artistId } : {}),
  };
}

function parseTrackItems(items: any[] | undefined, fallback?: TrackFallback): Track[] {
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const entry of asArray(items)) {
    const track = parseTrackItem(entry?.musicResponsiveListItemRenderer, fallback);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

function isAudioTrack(item: any): boolean {
  const type =
    columnRuns(item, 0)[0]?.navigationEndpoint?.watchEndpoint
      ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
  return type === 'MUSIC_VIDEO_TYPE_ATV';
}

// ─── Search ─────────────────────────────────────────────────────────

function searchResultItems(data: any): any[] {
  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents;
  if (!Array.isArray(sections)) return [];

  const items: any[] = [];
  for (const section of sections) {
    for (const entry of asArray(section?.musicShelfRenderer?.contents)) {
      if (entry?.musicResponsiveListItemRenderer) {
        items.push(entry.musicResponsiveListItemRenderer);
      }
    }
  }
  return items;
}

export function parseSongSearch(data: any): Track[] {
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const item of searchResultItems(data)) {
    const track = parseTrackItem(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

export function parseAlbumSearch(data: any): AlbumSummary[] {
  const albums: AlbumSummary[] = [];
  for (const item of searchResultItems(data)) {
    const target = browseTarget(item.navigationEndpoint);
    const title = joinRuns(columnRuns(item, 0));
    if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ALBUM' || !title) continue;
    albums.push({
      id: target.id,
      title,
      subtitle: joinRuns(columnRuns(item, 1)),
      thumbnailUrl: bestThumbnail(item.thumbnail),
    });
  }
  return albums;
}

export function parseArtistSearch(data: any): ArtistSummary[] {
  const artists: ArtistSummary[] = [];
  for (const item of searchResultItems(data)) {
    const target = browseTarget(item.navigationEndpoint);
    const name = joinRuns(columnRuns(item, 0));
    if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ARTIST' || !name) continue;
    artists.push({
      id: target.id,
      name,
      // "Artist • 353M monthly audience" → "353M monthly audience"
      subtitle: joinRuns(columnRuns(item, 1)).replace(/^Artist( • )?/, ''),
      thumbnailUrl: bestThumbnail(item.thumbnail),
    });
  }
  return artists;
}

export function parsePlaylistSearch(data: any): PlaylistSummary[] {
  const playlists: PlaylistSummary[] = [];
  for (const item of searchResultItems(data)) {
    const target = browseTarget(item.navigationEndpoint);
    const title = joinRuns(columnRuns(item, 0));
    if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_PLAYLIST' || !title) continue;
    playlists.push({
      id: stripPlaylistPrefix(target.id),
      title,
      subtitle: joinRuns(columnRuns(item, 1)),
      thumbnailUrl: bestThumbnail(item.thumbnail),
    });
  }
  return playlists;
}

function searchRequest(query: string, filter: MusicSearchFilter): Promise<any> {
  return ytmRequest('search', { query, params: SEARCH_PARAMS[filter] });
}

export async function searchSongs(query: string): Promise<Track[]> {
  return parseSongSearch(await searchRequest(query, 'songs'));
}

export async function searchAlbums(query: string): Promise<AlbumSummary[]> {
  return parseAlbumSearch(await searchRequest(query, 'albums'));
}

export async function searchArtists(query: string): Promise<ArtistSummary[]> {
  return parseArtistSearch(await searchRequest(query, 'artists'));
}

export async function searchPlaylists(query: string): Promise<PlaylistSummary[]> {
  return parsePlaylistSearch(await searchRequest(query, 'playlists'));
}

export function parseSearchSuggestions(data: any): string[] {
  const suggestions: string[] = [];
  for (const section of asArray(data?.contents)) {
    for (const entry of asArray(section?.searchSuggestionsSectionRenderer?.contents)) {
      const renderer = entry?.searchSuggestionRenderer;
      const text: string =
        renderer?.navigationEndpoint?.searchEndpoint?.query ??
        joinRuns(renderer?.suggestion?.runs);
      if (text && !suggestions.includes(text)) suggestions.push(text);
    }
  }
  return suggestions;
}

/** What YouTube Music would autocomplete the typed text to. */
export async function getSearchSuggestions(input: string): Promise<string[]> {
  if (!input.trim()) return [];
  return parseSearchSuggestions(
    await ytmRequest('music/get_search_suggestions', { input })
  );
}

// ─── Page cache ─────────────────────────────────────────────────────
// Artist, album and playlist pages are kept in memory so going back and
// forth between them doesn't reload.

const pageCache = new Map<string, { value: unknown; timestamp: number }>();
const pagesInFlight = new Map<string, Promise<unknown>>();

function cachedPage<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = pageCache.get(key);
  if (cached && Date.now() - cached.timestamp < PAGE_CACHE_TTL) {
    return Promise.resolve(cached.value as T);
  }

  const pending = pagesInFlight.get(key);
  if (pending) return pending as Promise<T>;

  const request = load()
    .then((value) => {
      pageCache.delete(key);
      pageCache.set(key, { value, timestamp: Date.now() });
      // Maps iterate in insertion order, so the first key is the oldest page
      while (pageCache.size > PAGE_CACHE_SIZE) {
        pageCache.delete(pageCache.keys().next().value as string);
      }
      return value;
    })
    .finally(() => pagesInFlight.delete(key));

  pagesInFlight.set(key, request);
  return request;
}

export function clearCatalogCache(): void {
  pageCache.clear();
}

// ─── Artist ─────────────────────────────────────────────────────────

function parseCarouselAlbums(items: any[]): AlbumSummary[] {
  const albums: AlbumSummary[] = [];
  for (const entry of items) {
    const item = entry?.musicTwoRowItemRenderer;
    const target = browseTarget(item?.navigationEndpoint);
    const title = joinRuns(item?.title?.runs);
    if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ALBUM' || !title) continue;
    albums.push({
      id: target.id,
      title,
      subtitle: joinRuns(item.subtitle?.runs),
      thumbnailUrl: bestThumbnail(item.thumbnailRenderer),
    });
  }
  return albums;
}

function parseCarouselArtists(items: any[]): ArtistSummary[] {
  const artists: ArtistSummary[] = [];
  for (const entry of items) {
    const item = entry?.musicTwoRowItemRenderer;
    const target = browseTarget(item?.navigationEndpoint);
    const name = joinRuns(item?.title?.runs);
    if (!target || target.pageType !== 'MUSIC_PAGE_TYPE_ARTIST' || !name) continue;
    artists.push({
      id: target.id,
      name,
      subtitle: joinRuns(item.subtitle?.runs),
      thumbnailUrl: bestThumbnail(item.thumbnailRenderer),
    });
  }
  return artists;
}

export function parseArtistPage(id: string, data: any): ArtistPage {
  const header =
    data?.header?.musicImmersiveHeaderRenderer ?? data?.header?.musicVisualHeaderRenderer;
  const name = joinRuns(header?.title?.runs);
  if (!name) {
    throw new Error('This artist could not be found on YouTube Music.');
  }

  const page: ArtistPage = {
    id,
    name,
    thumbnailUrl: squareThumbnail(header.thumbnail ?? header.foregroundThumbnail),
    subtitle: joinRuns(header.monthlyListenerCount?.runs) || undefined,
    topSongs: [],
    albums: [],
    singles: [],
    related: [],
  };

  const sections = asArray(
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents
  );

  for (const section of sections) {
    const songShelf = section?.musicShelfRenderer;
    if (songShelf && page.topSongs.length === 0) {
      page.topSongs = parseTrackItems(songShelf.contents, { artist: name, artistId: id });
      const allSongs = browseTarget(songShelf.bottomEndpoint);
      if (allSongs?.pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
        page.allSongsPlaylistId = stripPlaylistPrefix(allSongs.id);
      }
      continue;
    }

    const carousel = section?.musicCarouselShelfRenderer;
    if (!carousel) continue;
    const title = joinRuns(
      carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs
    );
    const items = asArray(carousel.contents);

    if (/^albums$/i.test(title)) {
      page.albums = parseCarouselAlbums(items);
    } else if (/^singles/i.test(title)) {
      page.singles = parseCarouselAlbums(items);
    } else if (/fans (might )?also like|similar artists/i.test(title)) {
      page.related = parseCarouselArtists(items);
    }
  }

  return page;
}

export function getArtist(artistId: string): Promise<ArtistPage> {
  return cachedPage(`artist:${artistId}`, async () =>
    parseArtistPage(artistId, await ytmRequest('browse', { browseId: artistId }))
  );
}

/**
 * Tracks from the listening history or from plain YouTube search only know
 * the artist's name; find the matching YouTube Music artist.
 */
export async function findArtistByName(name: string): Promise<ArtistSummary | null> {
  const query = primaryArtist(name) || name;
  if (!query.trim()) return null;

  const artists = await searchArtists(query);
  const exact = artists.find((a) => a.name.toLowerCase() === query.toLowerCase());
  return exact ?? artists[0] ?? null;
}

// ─── Albums and playlists ───────────────────────────────────────────

function responsiveHeader(data: any): any {
  const first =
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.[0];
  return (
    first?.musicResponsiveHeaderRenderer ??
    first?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer
  );
}

function secondarySection(data: any): any {
  return data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents
    ?.sectionListRenderer?.contents?.[0];
}

function continuationToken(items: any[] | undefined): string | undefined {
  const last = items?.[items.length - 1];
  return last?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
}

interface ParsedPlaylist {
  collection: Collection;
  continuation?: string;
}

export function parsePlaylistPage(id: string, data: any): ParsedPlaylist {
  const shelf = secondarySection(data)?.musicPlaylistShelfRenderer;
  if (!shelf) {
    throw new Error('This playlist could not be opened. It may be private or deleted.');
  }

  const header = responsiveHeader(data);
  const tracks = parseTrackItems(shelf.contents);

  return {
    collection: {
      kind: 'playlist',
      id,
      title: joinRuns(header?.title?.runs),
      // e.g. "Playlist • 2026"
      subtitle: joinRuns(header?.subtitle?.runs),
      coverUrl: bestThumbnail(header?.thumbnail) || tracks[0]?.thumbnailUrl || '',
      tracks,
    },
    continuation: continuationToken(shelf.contents),
  };
}

export function parsePlaylistContinuation(data: any): {
  tracks: Track[];
  continuation?: string;
} {
  const items = asArray(
    data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems
  );
  return { tracks: parseTrackItems(items), continuation: continuationToken(items) };
}

async function loadPlaylist(playlistId: string): Promise<Collection> {
  const { collection, continuation } = parsePlaylistPage(
    playlistId,
    await ytmRequest('browse', { browseId: `VL${playlistId}` })
  );

  const seen = new Set(collection.tracks.map((t) => t.id));
  let token = continuation;
  while (token && collection.tracks.length < MAX_PLAYLIST_TRACKS) {
    let page: ReturnType<typeof parsePlaylistContinuation>;
    try {
      page = parsePlaylistContinuation(await ytmRequest('browse', { continuation: token }));
    } catch {
      // Keep what was loaded so far rather than failing a long playlist
      break;
    }
    if (page.tracks.length === 0) {
      token = undefined;
      break;
    }
    for (const track of page.tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      collection.tracks.push(track);
    }
    token = page.continuation;
  }

  if (collection.tracks.length > MAX_PLAYLIST_TRACKS) {
    collection.tracks = collection.tracks.slice(0, MAX_PLAYLIST_TRACKS);
  }
  if (token) collection.isTruncated = true;
  return collection;
}

/** A YouTube or YouTube Music playlist, by its `list=` ID. */
export function getPlaylist(playlistId: string): Promise<Collection> {
  return cachedPage(`playlist:${playlistId}`, () => loadPlaylist(playlistId));
}

interface ParsedAlbum {
  collection: Collection;
  /** The album as a playlist of audio tracks, when some rows are music videos. */
  audioPlaylistId?: string;
}

export function parseAlbumPage(id: string, data: any): ParsedAlbum {
  const header = responsiveHeader(data);
  const title = joinRuns(header?.title?.runs);
  const shelf = secondarySection(data)?.musicShelfRenderer;
  if (!title || !shelf) {
    throw new Error('This album could not be found on YouTube Music.');
  }

  const artistRuns = asArray(header.straplineTextOne?.runs);
  const artistName = joinRuns(artistRuns);
  const artistId = findArtistId(artistRuns);
  const coverUrl = bestThumbnail(header.thumbnail);

  const rows = asArray(shelf.contents)
    .map((entry: any) => entry?.musicResponsiveListItemRenderer)
    .filter(Boolean);
  const hasMusicVideos = rows.some((row) => !isAudioTrack(row));
  const audioPlaylistId = /[?&]list=([\w-]+)/.exec(
    data?.microformat?.microformatDataRenderer?.urlCanonical ?? ''
  )?.[1];

  return {
    collection: {
      kind: 'album',
      id,
      title,
      // "Album • 2011" + "Adele"
      subtitle: [joinRuns(header.subtitle?.runs), artistName].filter(Boolean).join(SEPARATOR),
      coverUrl,
      artistId,
      artistName: artistName || undefined,
      tracks: parseTrackItems(shelf.contents, {
        artist: artistName,
        artistId,
        thumbnailUrl: coverUrl,
      }),
    },
    audioPlaylistId: hasMusicVideos ? audioPlaylistId : undefined,
  };
}

async function loadAlbum(albumId: string): Promise<Collection> {
  const { collection, audioPlaylistId } = parseAlbumPage(
    albumId,
    await ytmRequest('browse', { browseId: albumId })
  );

  // Album pages link the official music video for some songs (with its intro
  // and outro). The album's own playlist has the plain audio of every track.
  if (audioPlaylistId) {
    try {
      const audio = parsePlaylistPage(
        audioPlaylistId,
        await ytmRequest('browse', { browseId: `VL${audioPlaylistId}` })
      ).collection.tracks;
      if (audio.length === collection.tracks.length) {
        collection.tracks = audio.map((track) => ({
          ...track,
          thumbnailUrl: collection.coverUrl || track.thumbnailUrl,
        }));
      }
    } catch {
      // The album page's own track list still plays
    }
  }

  return collection;
}

export function getAlbum(albumId: string): Promise<Collection> {
  return cachedPage(`album:${albumId}`, () => loadAlbum(albumId));
}

export function getCollection(kind: Collection['kind'], id: string): Promise<Collection> {
  return kind === 'album' ? getAlbum(id) : getPlaylist(id);
}

// ─── Links ──────────────────────────────────────────────────────────

export interface CollectionLink {
  kind: Collection['kind'];
  id: string;
}

const BARE_PLAYLIST_ID = /^(?:VL)?((?:PL|OLAK5uy_|RDCLAK5uy_|UU|FL)[\w-]{10,})$/;
const BARE_ALBUM_ID = /^MPREb_[\w-]+$/;

/**
 * Recognise a pasted YouTube / YouTube Music playlist or album link (or a bare
 * playlist ID). Returns null for anything else, including single-video links.
 */
export function parseCollectionLink(text: string): CollectionLink | null {
  const input = text.trim();
  if (!input || /\s/.test(input)) return null;

  const bare = BARE_PLAYLIST_ID.exec(input);
  if (bare) return { kind: 'playlist', id: bare[1] };
  if (BARE_ALBUM_ID.test(input)) return { kind: 'album', id: input };

  if (!/(^|[/.])(youtube\.com|youtu\.be)\//i.test(input)) return null;

  const album = /\/browse\/(MPREb_[\w-]+)/.exec(input);
  if (album) return { kind: 'album', id: album[1] };

  const browsed = /\/browse\/VL([\w-]+)/.exec(input);
  if (browsed) return { kind: 'playlist', id: browsed[1] };

  const list = /[?&]list=([\w-]+)/.exec(input);
  if (list) return { kind: 'playlist', id: stripPlaylistPrefix(list[1]) };

  return null;
}
