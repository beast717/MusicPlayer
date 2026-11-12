import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Bottom tab param list
export type TabParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  LibraryTab: undefined;
  SettingsTab: undefined;
};

// Artist, album and YouTube playlist pages. Registered in every tab's stack
// so they open on top of whatever screen linked to them.
export type CatalogStackParamList = {
  /** Without an `artistId` the artist is looked up by name. */
  Artist: { artistId?: string; name: string };
  Collection: { kind: 'album' | 'playlist'; id: string; title?: string };
};

// Stack navigators inside each tab
export type HomeStackParamList = CatalogStackParamList & {
  Home: undefined;
  MixDetail: { mixId: string };
};

export type SearchStackParamList = CatalogStackParamList & {
  Search: undefined;
};

export type LibraryStackParamList = CatalogStackParamList & {
  Library: undefined;
  PlaylistDetail: { playlistId: string };
  Downloads: undefined;
  Favorites: undefined;
};

export type SettingsStackParamList = CatalogStackParamList & {
  Settings: undefined;
};

// Root stack (wraps tabs + modals)
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Player: undefined;
  AddToPlaylist: { trackId: string };
  CreatePlaylist: undefined;
};

// Screen prop types
export type HomeScreenProps = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'Home'>,
  BottomTabScreenProps<TabParamList>
>;

export type MixDetailScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'MixDetail'
>;

export type ArtistScreenProps = NativeStackScreenProps<CatalogStackParamList, 'Artist'>;

export type CollectionScreenProps = NativeStackScreenProps<
  CatalogStackParamList,
  'Collection'
>;

export type SearchScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SearchStackParamList, 'Search'>,
  BottomTabScreenProps<TabParamList>
>;

export type LibraryScreenProps = CompositeScreenProps<
  NativeStackScreenProps<LibraryStackParamList, 'Library'>,
  BottomTabScreenProps<TabParamList>
>;

export type PlaylistDetailScreenProps = NativeStackScreenProps<
  LibraryStackParamList,
  'PlaylistDetail'
>;

export type DownloadsScreenProps = NativeStackScreenProps<
  LibraryStackParamList,
  'Downloads'
>;

export type SettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'Settings'>,
  BottomTabScreenProps<TabParamList>
>;
