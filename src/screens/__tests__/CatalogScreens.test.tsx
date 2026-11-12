import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ArtistPage, Collection, Track } from '../../types';

const mockPush = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ push: mockPush, navigate: mockPush, goBack: mockGoBack }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : View) });
});
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {},
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  TrackType: { HLS: 'hls' },
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: true, type: 'wifi' }) },
  NetInfoStateType: {},
}));
jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  mmkvStorage: { getObject: () => undefined, setObject: () => {}, delete: () => {}, getAllKeys: () => [] },
}));
jest.mock('../../services/StreamExtractorWebView', () => ({
  extractStreamsViaWebView: jest.fn(),
}));
jest.mock('../../services/youtube', () => ({
  searchYouTube: jest.fn(async () => []),
}));

const mockRadio = jest.fn();
jest.mock('../../services/youtubeMusic', () => ({
  getRadioTracks: (id: string) => mockRadio(id),
}));

const mockCatalog = {
  searchSongs: jest.fn(),
  searchAlbums: jest.fn(),
  searchArtists: jest.fn(),
  searchPlaylists: jest.fn(),
  getSearchSuggestions: jest.fn(),
  getArtist: jest.fn(),
  findArtistByName: jest.fn(),
  getCollection: jest.fn(),
};
jest.mock('../../services/musicCatalog', () => ({
  ...jest.requireActual('../../services/musicCatalog'),
  searchSongs: (q: string) => mockCatalog.searchSongs(q),
  searchAlbums: (q: string) => mockCatalog.searchAlbums(q),
  searchArtists: (q: string) => mockCatalog.searchArtists(q),
  searchPlaylists: (q: string) => mockCatalog.searchPlaylists(q),
  getSearchSuggestions: (q: string) => mockCatalog.getSearchSuggestions(q),
  getArtist: (id: string) => mockCatalog.getArtist(id),
  findArtistByName: (name: string) => mockCatalog.findArtistByName(name),
  getCollection: (kind: string, id: string) => mockCatalog.getCollection(kind, id),
}));

import { SearchScreen } from '../SearchScreen';
import { ArtistScreen } from '../ArtistScreen';
import { CollectionScreen } from '../CollectionScreen';
import { TrackOptionsModal, SearchBar } from '../../components';
import {
  useHistoryStore,
  useHomeStore,
  useLibraryStore,
  usePlayerStore,
  useSearchStore,
} from '../../stores';

const track = (id: string, artist = 'Adele'): Track => ({
  id,
  title: `Song ${id}`,
  artist,
  duration: 200,
  thumbnailUrl: `https://img/${id}.jpg`,
});

const adelePage: ArtistPage = {
  id: 'UCadele',
  name: 'Adele',
  thumbnailUrl: 'https://img/adele.jpg',
  subtitle: '353M monthly audience',
  topSongs: [track('top1'), track('top2')],
  allSongsPlaylistId: 'OLAK5uy_all',
  albums: [{ id: 'MPREb_30', title: '30', subtitle: '2021', thumbnailUrl: 'https://img/30.jpg' }],
  singles: [],
  related: [{ id: 'UClewis', name: 'Lewis Capaldi', thumbnailUrl: 'https://img/lewis.jpg' }],
};

const album: Collection = {
  kind: 'album',
  id: 'MPREb_30',
  title: '30',
  subtitle: 'Album • 2021 • Adele',
  coverUrl: 'https://img/30.jpg',
  artistId: 'UCadele',
  artistName: 'Adele',
  tracks: [track('al1'), track('al2'), track('al3')],
};

function allText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat(Infinity).join(''));
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

async function renderAndSettle(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  await settle();
  return renderer;
}

/** Press the touchable that contains this exact text. */
async function pressText(renderer: TestRenderer.ReactTestRenderer, text: string) {
  const node = renderer.root
    .findAllByType(Text)
    .find((n) => [n.props.children].flat(Infinity).join('') === text);
  if (!node) throw new Error(`No text "${text}" on screen: ${allText(renderer).join(' | ')}`);
  let target: TestRenderer.ReactTestInstance | null = node;
  while (target && typeof target.props.onPress !== 'function') target = target.parent;
  if (!target) throw new Error(`"${text}" is not pressable`);
  await act(async () => {
    target!.props.onPress();
  });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  useHistoryStore.getState().clearHistory();
  useLibraryStore.setState({ favorites: [], playlists: [], downloadedTracks: [] });
  usePlayerStore.setState({ recentlyPlayed: [], currentTrack: null, queue: [] });
  useSearchStore.setState({
    query: '',
    submittedQuery: '',
    filter: 'songs',
    results: [],
    suggestions: [],
    searchHistory: [],
    queryCache: {},
    isSearching: false,
    error: null,
  });
  mockCatalog.searchSongs.mockImplementation(async (q: string) => [track(`song-${q}`)]);
  mockCatalog.searchArtists.mockImplementation(async () => [
    { id: 'UCadele', name: 'Adele', subtitle: '353M monthly audience', thumbnailUrl: 'https://img/a.jpg' },
  ]);
  mockCatalog.searchAlbums.mockResolvedValue([]);
  mockCatalog.searchPlaylists.mockResolvedValue([]);
  mockCatalog.getSearchSuggestions.mockImplementation(async (q: string) => [`${q}le`, `${q}le hello`]);
  mockCatalog.getArtist.mockResolvedValue(adelePage);
  mockCatalog.findArtistByName.mockResolvedValue({ id: 'UCadele', name: 'Adele', thumbnailUrl: '' });
  mockCatalog.getCollection.mockResolvedValue(album);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
  });
  jest.useRealTimers();
});

describe('SearchScreen', () => {
  async function type(renderer: TestRenderer.ReactTestRenderer, text: string) {
    await act(async () => {
      renderer.root.findByType(SearchBar).props.onChangeText(text);
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await settle();
  }

  it('suggests while typing, then searches and switches result type', async () => {
    const renderer = await renderAndSettle(<SearchScreen />);
    expect(allText(renderer)).toContain('Search for music');

    await type(renderer, 'ade');
    expect(allText(renderer)).toEqual(
      expect.arrayContaining(['Search for “ade”', 'adele', 'adele hello'])
    );
    // Typing alone never runs a search or fills the history
    expect(mockCatalog.searchSongs).not.toHaveBeenCalled();

    await pressText(renderer, 'adele');
    expect(mockCatalog.searchSongs).toHaveBeenCalledWith('adele');
    expect(allText(renderer)).toEqual(
      expect.arrayContaining(['Songs', 'Videos', 'Albums', 'Artists', 'Playlists', 'Song song-adele'])
    );
    expect(useSearchStore.getState().searchHistory).toEqual(['adele']);

    await pressText(renderer, 'Artists');
    expect(allText(renderer)).toEqual(expect.arrayContaining(['Adele', '353M monthly audience']));

    await pressText(renderer, 'Adele');
    expect(mockPush).toHaveBeenCalledWith('Artist', { artistId: 'UCadele', name: 'Adele' });
  });

  it('opens a pasted playlist link instead of searching for it', async () => {
    const renderer = await renderAndSettle(<SearchScreen />);

    await type(renderer, 'https://music.youtube.com/playlist?list=PL1234567890abc');
    expect(allText(renderer)).toContain('Open this playlist');

    await pressText(renderer, 'Open this playlist');
    expect(mockPush).toHaveBeenCalledWith('Collection', { kind: 'playlist', id: 'PL1234567890abc' });
    expect(mockCatalog.searchSongs).not.toHaveBeenCalled();
  });

  it('shows a retry when the search fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCatalog.searchSongs.mockRejectedValueOnce(new Error('YouTube Music returned 500'));
    const renderer = await renderAndSettle(<SearchScreen />);

    await type(renderer, 'adele');
    await pressText(renderer, 'Search for “adele”');
    expect(allText(renderer).join(' ')).toMatch(/Search failed/);

    await pressText(renderer, 'Try Again');
    expect(allText(renderer)).toContain('Song song-adele');
  });
});

describe('ArtistScreen', () => {
  const props = (params: object): any => ({
    route: { params },
    navigation: { push: mockPush, goBack: mockGoBack },
  });

  it('looks the artist up by name and shows songs, albums and related artists', async () => {
    const renderer = await renderAndSettle(<ArtistScreen {...props({ name: 'Adele' })} />);

    expect(mockCatalog.findArtistByName).toHaveBeenCalledWith('Adele');
    expect(mockCatalog.getArtist).toHaveBeenCalledWith('UCadele');
    expect(allText(renderer)).toEqual(
      expect.arrayContaining([
        'Adele',
        '353M monthly audience',
        'Top Songs',
        'Song top1',
        'Albums',
        '30',
        'Fans Also Like',
        'Lewis Capaldi',
      ])
    );
    expect(allText(renderer)).not.toContain('Singles & EPs');

    await pressText(renderer, 'Show All');
    expect(mockPush).toHaveBeenCalledWith('Collection', {
      kind: 'playlist',
      id: 'OLAK5uy_all',
      title: 'Adele · Songs',
    });

    await pressText(renderer, '30');
    expect(mockPush).toHaveBeenCalledWith('Collection', { kind: 'album', id: 'MPREb_30', title: '30' });
  });

  it('skips the lookup when the artist ID is known', async () => {
    await renderAndSettle(<ArtistScreen {...props({ artistId: 'UCadele', name: 'Adele' })} />);

    expect(mockCatalog.findArtistByName).not.toHaveBeenCalled();
  });

  it('explains an unknown artist and can retry after a network error', async () => {
    mockCatalog.findArtistByName.mockResolvedValueOnce(null);
    const unknown = await renderAndSettle(<ArtistScreen {...props({ name: 'Nobody' })} />);
    expect(allText(unknown)).toContain('"Nobody" was not found on YouTube Music.');

    mockCatalog.getArtist.mockRejectedValueOnce(new Error('Network request failed'));
    const offline = await renderAndSettle(
      <ArtistScreen {...props({ artistId: 'UCadele', name: 'Adele' })} />
    );
    expect(allText(offline).join(' ')).toMatch(/Could not load this artist/);

    await pressText(offline, 'Try Again');
    expect(allText(offline)).toContain('Top Songs');
  });
});

describe('CollectionScreen', () => {
  const props = (params: object): any => ({
    route: { params },
    navigation: { push: mockPush, goBack: mockGoBack },
  });

  it('shows an album and saves it to the library once', async () => {
    const renderer = await renderAndSettle(
      <CollectionScreen {...props({ kind: 'album', id: 'MPREb_30' })} />
    );

    expect(mockCatalog.getCollection).toHaveBeenCalledWith('album', 'MPREb_30');
    expect(allText(renderer)).toEqual(
      expect.arrayContaining(['30', 'Album • 2021 • Adele', '3 songs', 'Song al1'])
    );

    const save = renderer.root.findByProps({ accessibilityLabel: 'Save to library' });
    await act(async () => {
      save.props.onPress();
    });
    // The button is now disabled; a second tap must not create a duplicate
    const saved = renderer.root.findByProps({ accessibilityLabel: 'Saved to library' });
    expect(saved.props.disabled).toBe(true);

    const { playlists } = useLibraryStore.getState();
    expect(playlists).toHaveLength(1);
    expect(playlists[0]).toMatchObject({ name: '30', coverUrl: 'https://img/30.jpg' });
    expect(playlists[0].tracks.map((t) => t.id)).toEqual(['al1', 'al2', 'al3']);

    await pressText(renderer, 'Album • 2021 • Adele');
    expect(mockPush).toHaveBeenCalledWith('Artist', { artistId: 'UCadele', name: 'Adele' });
  });

  it('uses the title it was opened with when the playlist has none, and marks long ones', async () => {
    mockCatalog.getCollection.mockResolvedValueOnce({
      kind: 'playlist',
      id: 'PLx',
      title: '',
      subtitle: '',
      coverUrl: '',
      tracks: [track('p1')],
      isTruncated: true,
    });

    const renderer = await renderAndSettle(
      <CollectionScreen {...props({ kind: 'playlist', id: 'PLx', title: 'Adele · Songs' })} />
    );

    expect(allText(renderer)).toEqual(expect.arrayContaining(['Adele · Songs', 'First 1 song']));
  });

  it('shows why a private playlist cannot be opened', async () => {
    mockCatalog.getCollection.mockRejectedValueOnce(
      new Error('This playlist could not be opened. It may be private or deleted.')
    );

    const renderer = await renderAndSettle(
      <CollectionScreen {...props({ kind: 'playlist', id: 'PLprivate' })} />
    );

    expect(allText(renderer)).toContain(
      'This playlist could not be opened. It may be private or deleted.'
    );
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Save to library' })).toHaveLength(0);
  });
});

describe('TrackOptionsModal', () => {
  const song = { ...track('s1', 'Luis Fonsi & Daddy Yankee'), artistId: 'UCfonsi' };

  it('opens the artist of the song', async () => {
    const onClose = jest.fn();
    const renderer = await renderAndSettle(<TrackOptionsModal visible track={song} onClose={onClose} />);

    await pressText(renderer, 'Go to artist');

    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('Artist', { artistId: 'UCfonsi', name: 'Luis Fonsi' });
  });

  it('marks a song as not interested, removes it from the home screen, and can undo', async () => {
    useHomeStore.setState({ quickPicks: [song, track('other')], mixes: [], becauseYouListened: null });
    const renderer = await renderAndSettle(<TrackOptionsModal visible track={song} onClose={() => {}} />);

    await pressText(renderer, 'Not interested');
    expect(useHistoryStore.getState().notInterested).toHaveProperty('s1');
    expect(useHomeStore.getState().quickPicks.map((t) => t.id)).toEqual(['other']);

    expect(allText(renderer)).toContain('Undo "Not interested"');
    await pressText(renderer, 'Undo "Not interested"');
    expect(useHistoryStore.getState().notInterested).toEqual({});
  });

  it('adds the song to a new playlist', async () => {
    const onClose = jest.fn();
    useLibraryStore.getState().createPlaylist('Existing');
    const renderer = await renderAndSettle(<TrackOptionsModal visible track={song} onClose={onClose} />);

    await pressText(renderer, 'Add to playlist');
    await pressText(renderer, 'Existing');

    expect(useLibraryStore.getState().playlists[0].tracks.map((t) => t.id)).toEqual(['s1']);
    expect(onClose).toHaveBeenCalled();
  });

  it('starts a radio from the song', async () => {
    const playQueue = jest.fn();
    usePlayerStore.setState({ playQueue } as any);
    mockRadio.mockResolvedValue([track('r1'), song, track('r2')]);
    const renderer = await renderAndSettle(<TrackOptionsModal visible track={song} onClose={() => {}} />);

    await pressText(renderer, 'Start radio');

    expect(playQueue.mock.calls[0][0].map((t: Track) => t.id)).toEqual(['s1', 'r1', 'r2']);
  });
});
