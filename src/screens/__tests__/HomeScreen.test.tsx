import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Track } from '../../types';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
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

const mockRadio = jest.fn();
jest.mock('../../services/youtubeMusic', () => ({
  getRadioTracks: (id: string, options?: unknown) => mockRadio(id, options),
}));

import { HomeScreen } from '../HomeScreen';
import { MixDetailScreen } from '../MixDetailScreen';
import { useHistoryStore, useHomeStore, useLibraryStore, usePlayerStore } from '../../stores';

const track = (id: string, artist: string): Track => ({
  id,
  title: `Song ${id}`,
  artist,
  duration: 200,
  thumbnailUrl: `https://img/${id}.jpg`,
});

function allText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat(Infinity).join(''));
}

const mounted: TestRenderer.ReactTestRenderer[] = [];

async function renderAndSettle(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  useHistoryStore.getState().clearHistory();
  useLibraryStore.setState({ favorites: [], playlists: [], downloadedTracks: [] });
  usePlayerStore.setState({ recentlyPlayed: [], currentTrack: null });
  useHomeStore.setState({
    quickPicks: [],
    mixes: [],
    becauseYouListened: null,
    isLoading: false,
    loadFailed: false,
    lastUpdated: null,
  });
  mockRadio.mockImplementation(async (id: string) => [
    track(id, 'Seed Artist'),
    ...Array.from({ length: 6 }, (_, i) => track(`${id}-r${i}`, `Related ${i}`)),
  ]);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
  });
});

it('shows the welcome state with no listening at all', async () => {
  const renderer = await renderAndSettle(<HomeScreen />);

  expect(allText(renderer)).toContain('Welcome to MusicPlayer');
  expect(mockRadio).not.toHaveBeenCalled();
});

it('shows personalised sections once there is listening history', async () => {
  const history = useHistoryStore.getState();
  const adele = track('adele1', 'Adele');
  for (let i = 0; i < 5; i++) history.recordPlay(adele);
  history.recordPlay(track('burna1', 'Burna Boy'));

  const renderer = await renderAndSettle(<HomeScreen />);
  const text = allText(renderer);

  expect(text).toEqual(
    expect.arrayContaining([
      'Quick Picks',
      'Mixes for You',
      'Adele Mix',
      'Burna Boy Mix',
      'Listen Again',
      'Song adele1',
      'Song adele1-r0',
    ])
  );
  expect(text).not.toContain('Welcome to MusicPlayer');
});

it('still shows the local sections when recommendations cannot be loaded', async () => {
  mockRadio.mockRejectedValue(new Error('offline'));
  useHistoryStore.getState().recordPlay(track('adele1', 'Adele'));

  const renderer = await renderAndSettle(<HomeScreen />);
  const text = allText(renderer);

  expect(text).toContain('Listen Again');
  expect(text).not.toContain('Quick Picks');
  expect(text).not.toContain('Mixes for You');
});

it('opens a mix and can save it as a playlist', async () => {
  useHistoryStore.getState().recordPlay(track('adele1', 'Adele'));
  await useHomeStore.getState().refresh();
  const props: any = {
    route: { params: { mixId: 'mix-adele1' } },
    navigation: { goBack: mockGoBack },
  };

  const renderer = await renderAndSettle(<MixDetailScreen {...props} />);

  expect(allText(renderer)).toEqual(expect.arrayContaining(['Adele Mix', 'Song adele1-r0']));

  const saveButton = renderer.root.findByProps({ accessibilityLabel: 'Save as playlist' });
  await act(async () => {
    saveButton.props.onPress();
  });

  const [playlist] = useLibraryStore.getState().playlists;
  expect(playlist.name).toBe('Adele Mix');
  expect(playlist.tracks).toHaveLength(7);
});

it('handles a mix that no longer exists', async () => {
  const props: any = {
    route: { params: { mixId: 'mix-gone' } },
    navigation: { goBack: mockGoBack },
  };

  const renderer = await renderAndSettle(<MixDetailScreen {...props} />);

  expect(allText(renderer)).toContain('This mix is no longer available.');
});
