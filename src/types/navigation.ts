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

// Stack navigators inside each tab
export type HomeStackParamList = {
  Home: undefined;
};

export type SearchStackParamList = {
  Search: undefined;
};

export type LibraryStackParamList = {
  Library: undefined;
  PlaylistDetail: { playlistId: string };
  Downloads: undefined;
  Favorites: undefined;
};

export type SettingsStackParamList = {
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
