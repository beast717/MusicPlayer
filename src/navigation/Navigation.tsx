import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet, Modal, StatusBar } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Home,
  Search,
  Library,
  Settings,
} from 'lucide-react-native';

import { useTheme } from '../theme';
import { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '../theme/spacing';
import { MiniPlayer } from '../components';
import {
  HomeScreen,
  MixDetailScreen,
  ArtistScreen,
  CollectionScreen,
  SearchScreen,
  PlayerScreen,
  LibraryScreen,
  PlaylistDetailScreen,
  FavoritesScreen,
  DownloadsScreen,
  SettingsScreen,
} from '../screens';
import { usePlayerStore } from '../stores';
import { describePlaybackError } from '../services/playbackErrors';
import { primaryArtist } from '../services/recommendations';

import type {
  Track,
  TabParamList,
  HomeStackParamList,
  SearchStackParamList,
  LibraryStackParamList,
  SettingsStackParamList,
} from '../types';

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const navigationRef = createNavigationContainerRef();

// ─── Stack Navigators ──────────────────────────────────────────

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="MixDetail" component={MixDetailScreen} />
      <HomeStack.Screen name="Artist" component={ArtistScreen} />
      <HomeStack.Screen name="Collection" component={CollectionScreen} />
    </HomeStack.Navigator>
  );
}

function SearchStackNavigator() {
  return (
    <SearchStack.Navigator screenOptions={{ headerShown: false }}>
      <SearchStack.Screen name="Search" component={SearchScreen} />
      <SearchStack.Screen name="Artist" component={ArtistScreen} />
      <SearchStack.Screen name="Collection" component={CollectionScreen} />
    </SearchStack.Navigator>
  );
}

function LibraryStackNavigator() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="Library" component={LibraryScreen} />
      <LibraryStack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
      <LibraryStack.Screen name="Downloads" component={DownloadsScreen} />
      <LibraryStack.Screen name="Favorites" component={FavoritesScreen} />
      <LibraryStack.Screen name="Artist" component={ArtistScreen} />
      <LibraryStack.Screen name="Collection" component={CollectionScreen} />
    </LibraryStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Artist" component={ArtistScreen} />
      <SettingsStack.Screen name="Collection" component={CollectionScreen} />
    </SettingsStack.Navigator>
  );
}

// ─── Main Navigation ───────────────────────────────────────────

export function Navigation() {
  const { theme, isDark } = useTheme();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playerError = usePlayerStore((s) => s.error);
  const clearPlayerError = usePlayerStore((s) => s.setError);
  const [playerVisible, setPlayerVisible] = useState(false);
  const shownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playerError || shownErrorRef.current === playerError) {
      return;
    }

    shownErrorRef.current = playerError;
    const dismiss = () => {
      shownErrorRef.current = null;
      clearPlayerError(null);
    };

    // Being offline explains a failure better than the stream diagnostics do
    NetInfo.fetch()
      .then((state) => state.isConnected, () => null)
      .then((isOnline) => {
        const info = describePlaybackError(playerError, isOnline);
        Alert.alert(info.title, info.message, [
          {
            text: 'Details',
            onPress: () =>
              Alert.alert('Technical Details', info.details, [{ text: 'OK', onPress: dismiss }]),
          },
          { text: 'OK', onPress: dismiss },
        ]);
      });
  }, [clearPlayerError, playerError]);

  // The player is a modal outside the navigators: close it, then open the
  // artist on top of whichever tab is showing (every tab's stack has the screen)
  const handleOpenArtist = (track: Track) => {
    setPlayerVisible(false);
    if (!navigationRef.isReady()) return;
    navigationRef.dispatch(
      StackActions.push('Artist', {
        artistId: track.artistId,
        name: primaryArtist(track.artist) || track.artist,
      })
    );
  };

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: theme.background,
          card: theme.tabBar,
          border: theme.tabBarBorder,
          primary: theme.primary,
          text: theme.text,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: theme.background,
          card: theme.tabBar,
          border: theme.tabBarBorder,
          primary: theme.primary,
          text: theme.text,
        },
      };

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <View style={styles.container}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: theme.iconActive,
            tabBarInactiveTintColor: theme.icon,
            tabBarStyle: {
              backgroundColor: theme.tabBar,
              borderTopColor: theme.tabBarBorder,
              height: TAB_BAR_HEIGHT,
              paddingTop: 8,
              paddingBottom: 30,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '500',
            },
            tabBarIcon: ({ color, size }) => {
              switch (route.name) {
                case 'HomeTab':
                  return <Home size={size} color={color} />;
                case 'SearchTab':
                  return <Search size={size} color={color} />;
                case 'LibraryTab':
                  return <Library size={size} color={color} />;
                case 'SettingsTab':
                  return <Settings size={size} color={color} />;
                default:
                  return null;
              }
            },
          })}
        >
          <Tab.Screen
            name="HomeTab"
            component={HomeStackNavigator}
            options={{ tabBarLabel: 'Home' }}
          />
          <Tab.Screen
            name="SearchTab"
            component={SearchStackNavigator}
            options={{ tabBarLabel: 'Search' }}
          />
          <Tab.Screen
            name="LibraryTab"
            component={LibraryStackNavigator}
            options={{ tabBarLabel: 'Library' }}
          />
          <Tab.Screen
            name="SettingsTab"
            component={SettingsStackNavigator}
            options={{ tabBarLabel: 'Settings' }}
          />
        </Tab.Navigator>

        {/* Mini Player — sits above the tab bar */}
        {currentTrack && (
          <View
            style={[
              styles.miniPlayerContainer,
              { bottom: TAB_BAR_HEIGHT },
            ]}
          >
            <MiniPlayer onPress={() => setPlayerVisible(true)} />
          </View>
        )}
      </View>

      {/* Full-screen Player Modal */}
      <Modal
        visible={playerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPlayerVisible(false)}
        onDismiss={() => setPlayerVisible(false)}
      >
        <PlayerScreen
          onDismiss={() => setPlayerVisible(false)}
          onOpenArtist={handleOpenArtist}
        />
      </Modal>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  miniPlayerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
