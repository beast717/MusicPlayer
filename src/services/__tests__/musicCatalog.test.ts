jest.mock('../storage', () => ({
  mmkvStorage: {
    getObject: () => undefined,
    setObject: () => {},
    delete: () => {},
    getAllKeys: () => [],
  },
}));

import {
  parseSongSearch,
  parseAlbumSearch,
  parseArtistSearch,
  parsePlaylistSearch,
  parseSearchSuggestions,
  parseArtistPage,
  parseAlbumPage,
  parsePlaylistPage,
  parsePlaylistContinuation,
  parseCollectionLink,
  getPlaylist,
  getAlbum,
  getArtist,
  findArtistByName,
  clearCatalogCache,
  MAX_PLAYLIST_TRACKS,
} from '../musicCatalog';

// ─── Fixtures: the shapes music.youtube.com returns, trimmed to the used fields ───

const browse = (browseId: string, pageType: string) => ({
  browseEndpoint: {
    browseId,
    browseEndpointContextSupportedConfigs: {
      browseEndpointContextMusicConfig: { pageType: `MUSIC_PAGE_TYPE_${pageType}` },
    },
  },
});

const watch = (videoId: string, type = 'ATV') => ({
  watchEndpoint: {
    videoId,
    watchEndpointMusicSupportedConfigs: {
      watchEndpointMusicConfig: { musicVideoType: `MUSIC_VIDEO_TYPE_${type}` },
    },
  },
});

const column = (runs: unknown[] | null) =>
  runs
    ? { musicResponsiveListItemFlexColumnRenderer: { text: { runs } } }
    : { musicResponsiveListItemFlexColumnRenderer: { text: {} } };

const thumbnail = (url: string) => ({
  musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://tiny' }, { url }] } },
});

const artistRun = (name: string, id: string) => ({
  text: name,
  navigationEndpoint: browse(id, 'ARTIST'),
});

interface SongOptions {
  artists?: unknown[];
  duration?: string;
  fixedDuration?: string;
  thumb?: string | null;
  videoType?: string;
  greyedOut?: boolean;
}

const songItem = (videoId: string | null, title: string, options: SongOptions = {}) => ({
  musicResponsiveListItemRenderer: {
    ...(options.thumb === null
      ? {}
      : { thumbnail: thumbnail(options.thumb ?? `https://yt3.googleusercontent.com/${videoId}=w120-h120-l90-rj`) }),
    flexColumns: [
      column([{ text: title, navigationEndpoint: videoId ? watch(videoId, options.videoType) : undefined }]),
      column(
        options.artists === undefined
          ? null
          : [
              ...options.artists,
              ...(options.duration
                ? [{ text: ' • ' }, { text: 'Some Album' }, { text: ' • ' }, { text: options.duration }]
                : []),
            ]
      ),
    ],
    ...(options.fixedDuration
      ? {
          fixedColumns: [
            { musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: options.fixedDuration }] } } },
          ],
        }
      : {}),
    ...(videoId ? { playlistItemData: { videoId } } : {}),
    ...(options.greyedOut
      ? { musicItemRendererDisplayPolicy: 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT' }
      : {}),
  },
});

const navItem = (
  title: string,
  subtitle: unknown[],
  endpoint: unknown,
  thumb = 'https://yt3.googleusercontent.com/cover=w544-h544-l90-rj'
) => ({
  musicResponsiveListItemRenderer: {
    thumbnail: thumbnail(thumb),
    flexColumns: [column([{ text: title }]), column(subtitle)],
    navigationEndpoint: endpoint,
  },
});

const searchResponse = (items: unknown[]) => ({
  contents: {
    tabbedSearchResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  { itemSectionRenderer: { contents: [{}] } },
                  { musicShelfRenderer: { contents: items } },
                ],
              },
            },
          },
        },
      ],
    },
  },
});

const twoRow = (title: string, subtitle: string, endpoint: unknown) => ({
  musicTwoRowItemRenderer: {
    title: { runs: [{ text: title }] },
    subtitle: { runs: [{ text: subtitle }] },
    navigationEndpoint: endpoint,
    thumbnailRenderer: thumbnail('https://yt3.googleusercontent.com/two=w544-h544-l90-rj'),
  },
});

const carousel = (title: string, contents: unknown[]) => ({
  musicCarouselShelfRenderer: {
    header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: title }] } } },
    contents,
  },
});

const twoColumnPage = (header: unknown, section: unknown, extra: object = {}) => ({
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: { sectionListRenderer: { contents: [{ musicResponsiveHeaderRenderer: header }] } },
          },
        },
      ],
      secondaryContents: { sectionListRenderer: { contents: [section] } },
    },
  },
  ...extra,
});

const continuationItem = (token: string) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
});

const playlistPage = (title: string, items: unknown[]) =>
  twoColumnPage(
    {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: 'Playlist' }, { text: ' • ' }, { text: '2026' }] },
      thumbnail: thumbnail('https://yt3.googleusercontent.com/pl=s1200'),
    },
    { musicPlaylistShelfRenderer: { contents: items } }
  );

const continuationPage = (items: unknown[]) => ({
  onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items } }],
});

const adele = artistRun('Adele', 'UCadele');

function mockResponses(handler: (body: any, endpoint: string) => unknown) {
  const fetchMock = jest.fn(async (url: string, init: { body: string }) => {
    const endpoint = /youtubei\/v1\/(.+)\?/.exec(url)?.[1] ?? '';
    const data = handler(JSON.parse(init.body), endpoint);
    return { ok: data !== undefined, status: data !== undefined ? 200 : 500, json: async () => data };
  });
  global.fetch = fetchMock as any;
  return fetchMock;
}

beforeEach(() => {
  clearCatalogCache();
});

// ─── Search ─────────────────────────────────────────────────────────

describe('search parsing', () => {
  it('reads songs with artists, artist link, duration and a usable cover size', () => {
    const data = searchResponse([
      songItem('vid00000001', 'Someone Like You', { artists: [adele], duration: '4:46' }),
      songItem('vid00000002', 'Duet', {
        artists: [adele, { text: ' & ' }, artistRun('Other', 'UCother')],
        duration: '1:02:03',
      }),
      songItem('vid00000001', 'Duplicate', { artists: [adele], duration: '1:00' }),
      songItem(null, 'No video id', { artists: [adele] }),
      songItem('vid00000003', 'Unavailable', { artists: [adele], greyedOut: true }),
    ]);

    expect(parseSongSearch(data)).toEqual([
      {
        id: 'vid00000001',
        title: 'Someone Like You',
        artist: 'Adele',
        artistId: 'UCadele',
        duration: 286,
        thumbnailUrl: 'https://yt3.googleusercontent.com/vid00000001=w544-h544-l90-rj',
      },
      {
        id: 'vid00000002',
        title: 'Duet',
        artist: 'Adele & Other',
        artistId: 'UCadele',
        duration: 3723,
        thumbnailUrl: 'https://yt3.googleusercontent.com/vid00000002=w544-h544-l90-rj',
      },
    ]);
  });

  it('reads albums, artists and playlists, ignoring rows of another type', () => {
    const data = searchResponse([
      navItem('21', [{ text: 'Album' }, { text: ' • ' }, { text: 'Adele' }], browse('MPREb_21', 'ALBUM')),
      navItem('Adele', [{ text: 'Artist' }, { text: ' • ' }, { text: '353M monthly audience' }], browse('UCadele', 'ARTIST')),
      navItem('Workout', [{ text: 'PlayItDaily' }, { text: ' • ' }, { text: '16M views' }], browse('VLPLworkout00000', 'PLAYLIST')),
    ]);

    expect(parseAlbumSearch(data)).toEqual([
      {
        id: 'MPREb_21',
        title: '21',
        subtitle: 'Album • Adele',
        thumbnailUrl: 'https://yt3.googleusercontent.com/cover=w544-h544-l90-rj',
      },
    ]);
    expect(parseArtistSearch(data)).toEqual([
      expect.objectContaining({ id: 'UCadele', name: 'Adele', subtitle: '353M monthly audience' }),
    ]);
    expect(parsePlaylistSearch(data)).toEqual([
      expect.objectContaining({ id: 'PLworkout00000', title: 'Workout', subtitle: 'PlayItDaily • 16M views' }),
    ]);
  });

  it('returns nothing for unknown shapes', () => {
    for (const data of [null, {}, { contents: { somethingElse: [] } }]) {
      expect(parseSongSearch(data)).toEqual([]);
      expect(parseAlbumSearch(data)).toEqual([]);
      expect(parseArtistSearch(data)).toEqual([]);
      expect(parsePlaylistSearch(data)).toEqual([]);
      expect(parseSearchSuggestions(data)).toEqual([]);
    }
  });

  it('reads suggestions without duplicates', () => {
    const suggestion = (query: string) => ({
      searchSuggestionRenderer: { navigationEndpoint: { searchEndpoint: { query } } },
    });
    const data = {
      contents: [
        {
          searchSuggestionsSectionRenderer: {
            contents: [
              suggestion('adele'),
              suggestion('adele hello'),
              suggestion('adele'),
              { searchSuggestionRenderer: { suggestion: { runs: [{ text: 'ade' }, { text: 'la' }] } } },
              { musicResponsiveListItemRenderer: {} },
            ],
          },
        },
      ],
    };

    expect(parseSearchSuggestions(data)).toEqual(['adele', 'adele hello', 'adela']);
  });
});

// ─── Artist ─────────────────────────────────────────────────────────

describe('artist page', () => {
  const artistResponse = {
    header: {
      musicImmersiveHeaderRenderer: {
        title: { runs: [{ text: 'Adele' }] },
        monthlyListenerCount: { runs: [{ text: '353M monthly audience' }] },
        thumbnail: thumbnail('https://lh3.googleusercontent.com/banner=w1440-h600-p-l90-rj'),
      },
    },
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicShelfRenderer: {
                        contents: [songItem('top00000001', 'Rolling in the Deep', { artists: [adele] })],
                        bottomEndpoint: browse('VLOLAK5uy_allsongs', 'PLAYLIST'),
                      },
                    },
                    carousel('Albums', [twoRow('30', '2021', browse('MPREb_30', 'ALBUM'))]),
                    carousel('Singles & EPs', [twoRow('Easy On Me', 'Single • 2021', browse('MPREb_easy', 'ALBUM'))]),
                    carousel('Videos', [twoRow('A video', 'Adele', watch('video000001', 'OMV'))]),
                    carousel('Fans might also like', [
                      twoRow('Lewis Capaldi', '229M monthly audience', browse('UClewis', 'ARTIST')),
                    ]),
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };

  it('reads the header, top songs, albums, singles and related artists', () => {
    const page = parseArtistPage('UCadele', artistResponse);

    expect(page).toMatchObject({
      id: 'UCadele',
      name: 'Adele',
      subtitle: '353M monthly audience',
      // Banner turned into a square crop
      thumbnailUrl: 'https://lh3.googleusercontent.com/banner=w544-h544-p-l90-rj',
      allSongsPlaylistId: 'OLAK5uy_allsongs',
    });
    expect(page.topSongs).toEqual([
      expect.objectContaining({ id: 'top00000001', artist: 'Adele', artistId: 'UCadele', duration: 0 }),
    ]);
    expect(page.albums.map((a) => a.id)).toEqual(['MPREb_30']);
    expect(page.singles.map((a) => a.id)).toEqual(['MPREb_easy']);
    expect(page.related).toEqual([expect.objectContaining({ id: 'UClewis', name: 'Lewis Capaldi' })]);
  });

  it('rejects a page without an artist header', () => {
    expect(() => parseArtistPage('UCnope', { responseContext: {} })).toThrow('could not be found');
  });

  it('loads an artist once and serves it from the cache afterwards', async () => {
    const fetchMock = mockResponses(() => artistResponse);

    const first = await getArtist('UCadele');
    const second = await getArtist('UCadele');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ browseId: 'UCadele' });
  });

  it('finds an artist by the name on a track', async () => {
    const fetchMock = mockResponses(() =>
      searchResponse([
        navItem('Luis Fonsi Tribute', [{ text: 'Artist' }], browse('UCtribute', 'ARTIST')),
        navItem('Luis Fonsi', [{ text: 'Artist' }], browse('UCfonsi', 'ARTIST')),
      ])
    );

    const artist = await findArtistByName('Luis Fonsi & Daddy Yankee');

    expect(artist?.id).toBe('UCfonsi');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toBe('Luis Fonsi');
    expect(await findArtistByName('   ')).toBeNull();
  });
});

// ─── Playlists ──────────────────────────────────────────────────────

describe('playlist', () => {
  it('reads the header, the tracks and the token for the next page', () => {
    const { collection, continuation } = parsePlaylistPage(
      'PLworkout00000',
      playlistPage('Workout', [
        songItem('pl000000001', 'Bad Angel', { artists: [adele], fixedDuration: '2:30', thumb: 'https://i.ytimg.com/vi/pl000000001/hq.jpg' }),
        continuationItem('TOKEN1'),
      ])
    );

    expect(collection).toMatchObject({
      kind: 'playlist',
      id: 'PLworkout00000',
      title: 'Workout',
      subtitle: 'Playlist • 2026',
      coverUrl: 'https://yt3.googleusercontent.com/pl=s1200',
    });
    expect(collection.tracks).toEqual([
      {
        id: 'pl000000001',
        title: 'Bad Angel',
        artist: 'Adele',
        artistId: 'UCadele',
        duration: 150,
        thumbnailUrl: 'https://i.ytimg.com/vi/pl000000001/hq.jpg',
      },
    ]);
    expect(continuation).toBe('TOKEN1');
  });

  it('rejects a private or deleted playlist', () => {
    expect(() => parsePlaylistPage('PLgone', { responseContext: {} })).toThrow('private or deleted');
  });

  it('reads a continuation page', () => {
    const page = parsePlaylistContinuation(
      continuationPage([songItem('c0000000001', 'More', { artists: [adele] }), continuationItem('TOKEN2')])
    );

    expect(page.tracks.map((t) => t.id)).toEqual(['c0000000001']);
    expect(page.continuation).toBe('TOKEN2');
    expect(parsePlaylistContinuation({})).toEqual({ tracks: [], continuation: undefined });
  });

  it('follows every page of a long playlist', async () => {
    const fetchMock = mockResponses((body) => {
      if (body.browseId === 'VLPLlong0000000') {
        return playlistPage('Long', [songItem('a0000000001', 'One', { artists: [adele] }), continuationItem('T1')]);
      }
      if (body.continuation === 'T1') {
        return continuationPage([
          songItem('a0000000002', 'Two', { artists: [adele] }),
          songItem('a0000000001', 'One again', { artists: [adele] }),
          continuationItem('T2'),
        ]);
      }
      if (body.continuation === 'T2') {
        return continuationPage([songItem('a0000000003', 'Three', { artists: [adele] })]);
      }
      return undefined;
    });

    const playlist = await getPlaylist('PLlong0000000');

    expect(playlist.tracks.map((t) => t.id)).toEqual(['a0000000001', 'a0000000002', 'a0000000003']);
    expect(playlist.isTruncated).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps what was loaded when a later page fails', async () => {
    mockResponses((body) =>
      body.browseId
        ? playlistPage('Flaky', [songItem('a0000000001', 'One', { artists: [adele] }), continuationItem('T1')])
        : undefined
    );

    const playlist = await getPlaylist('PLflaky000000');

    expect(playlist.tracks).toHaveLength(1);
    expect(playlist.isTruncated).toBe(true);
  });

  it('stops at the track limit', async () => {
    let page = 0;
    const pageOf = (n: number) =>
      Array.from({ length: 400 }, (_, i) => songItem(`p${n}-${i}`, `Song ${n}-${i}`, { artists: [adele] }));
    mockResponses((body) => {
      page++;
      const items = [...pageOf(page), continuationItem(`T${page}`)];
      return body.browseId ? playlistPage('Huge', items) : continuationPage(items);
    });

    const playlist = await getPlaylist('PLhuge0000000');

    expect(playlist.tracks).toHaveLength(MAX_PLAYLIST_TRACKS);
    expect(playlist.isTruncated).toBe(true);
    expect(page).toBe(3);
  });

  it('does not cache a failed load', async () => {
    mockResponses(() => undefined);
    await expect(getPlaylist('PLretry000000')).rejects.toThrow('500');

    mockResponses(() => playlistPage('Back', [songItem('a0000000001', 'One', { artists: [adele] })]));
    expect((await getPlaylist('PLretry000000')).title).toBe('Back');
  });
});

// ─── Albums ─────────────────────────────────────────────────────────

describe('album', () => {
  const albumHeader = {
    title: { runs: [{ text: '21' }] },
    subtitle: { runs: [{ text: 'Album' }, { text: ' • ' }, { text: '2011' }] },
    straplineTextOne: { runs: [adele] },
    thumbnail: thumbnail('https://yt3.googleusercontent.com/album=w544-h544-l90-rj'),
  };
  const albumPage = (items: unknown[]) =>
    twoColumnPage(
      albumHeader,
      { musicShelfRenderer: { contents: items } },
      {
        microformat: {
          microformatDataRenderer: { urlCanonical: 'https://music.youtube.com/playlist?list=OLAK5uy_album21' },
        },
      }
    );

  it('fills in the album artist and cover that track rows leave out', () => {
    const { collection, audioPlaylistId } = parseAlbumPage(
      'MPREb_21',
      albumPage([
        songItem('al000000001', 'Rumour Has It', { fixedDuration: '3:43', thumb: null }),
        songItem('al000000002', 'Turning Tables', { fixedDuration: '4:10', thumb: null }),
      ])
    );

    expect(collection).toMatchObject({
      kind: 'album',
      id: 'MPREb_21',
      title: '21',
      subtitle: 'Album • 2011 • Adele',
      artistId: 'UCadele',
      artistName: 'Adele',
    });
    expect(collection.tracks[0]).toEqual({
      id: 'al000000001',
      title: 'Rumour Has It',
      artist: 'Adele',
      artistId: 'UCadele',
      duration: 223,
      thumbnailUrl: 'https://yt3.googleusercontent.com/album=w544-h544-l90-rj',
    });
    // Every row is an audio track already
    expect(audioPlaylistId).toBeUndefined();
  });

  it('swaps music videos for the audio versions from the album playlist', async () => {
    const fetchMock = mockResponses((body) => {
      if (body.browseId === 'MPREb_21') {
        return albumPage([
          songItem('video000001', 'Rolling in the Deep', { fixedDuration: '3:54', thumb: null, videoType: 'OMV' }),
          songItem('al000000002', 'Rumour Has It', { fixedDuration: '3:43', thumb: null }),
        ]);
      }
      if (body.browseId === 'VLOLAK5uy_album21') {
        return playlistPage('21', [
          songItem('audio000001', 'Rolling in the Deep', { artists: [adele], fixedDuration: '3:49' }),
          songItem('al000000002', 'Rumour Has It', { artists: [adele], fixedDuration: '3:43' }),
        ]);
      }
      return undefined;
    });

    const album = await getAlbum('MPREb_21');

    expect(album.tracks.map((t) => t.id)).toEqual(['audio000001', 'al000000002']);
    expect(album.tracks[0].thumbnailUrl).toBe('https://yt3.googleusercontent.com/album=w544-h544-l90-rj');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps its own track list when the audio playlist cannot be used', async () => {
    mockResponses((body) =>
      body.browseId === 'MPREb_21'
        ? albumPage([songItem('video000001', 'Rolling in the Deep', { fixedDuration: '3:54', thumb: null, videoType: 'OMV' })])
        : undefined
    );

    expect((await getAlbum('MPREb_21')).tracks.map((t) => t.id)).toEqual(['video000001']);
  });

  it('rejects a page that is not an album', () => {
    expect(() => parseAlbumPage('MPREb_x', {})).toThrow('could not be found');
  });
});

// ─── Links ──────────────────────────────────────────────────────────

describe('parseCollectionLink', () => {
  it.each([
    ['https://music.youtube.com/playlist?list=PLu0ocO48LFms5WsI1ipaeanxqRjn2fC_5&si=abc', 'playlist', 'PLu0ocO48LFms5WsI1ipaeanxqRjn2fC_5'],
    ['https://www.youtube.com/playlist?list=PL1234567890abc', 'playlist', 'PL1234567890abc'],
    ['https://www.youtube.com/watch?v=XqoanTj5pNY&list=PL1234567890abc&index=3', 'playlist', 'PL1234567890abc'],
    ['https://youtu.be/XqoanTj5pNY?list=PL1234567890abc', 'playlist', 'PL1234567890abc'],
    ['youtube.com/playlist?list=OLAK5uy_kNiuS8m9gEwAoTTt62VF', 'playlist', 'OLAK5uy_kNiuS8m9gEwAoTTt62VF'],
    ['  https://m.youtube.com/playlist?list=PL1234567890abc  ', 'playlist', 'PL1234567890abc'],
    ['https://music.youtube.com/browse/VLPL1234567890abc', 'playlist', 'PL1234567890abc'],
    ['https://music.youtube.com/browse/MPREb_IRSjexVmMMl', 'album', 'MPREb_IRSjexVmMMl'],
    ['PLu0ocO48LFms5WsI1ipaeanxqRjn2fC_5', 'playlist', 'PLu0ocO48LFms5WsI1ipaeanxqRjn2fC_5'],
    ['VLPL1234567890abc', 'playlist', 'PL1234567890abc'],
    ['MPREb_IRSjexVmMMl', 'album', 'MPREb_IRSjexVmMMl'],
  ])('%s', (input, kind, id) => {
    expect(parseCollectionLink(input)).toEqual({ kind, id });
  });

  it.each([
    'adele hello',
    'playlist',
    'PLAYLIST',
    '',
    'https://youtu.be/XqoanTj5pNY',
    'https://www.youtube.com/watch?v=XqoanTj5pNY',
    'https://evil.example/?list=PL1234567890abc',
    'https://notyoutube.com/playlist?list=PL1234567890abc',
    'best of https://www.youtube.com/playlist?list=PL1234567890abc',
  ])('ignores %p', (input) => {
    expect(parseCollectionLink(input)).toBeNull();
  });
});
