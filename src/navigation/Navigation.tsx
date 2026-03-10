import React, { useEffect, useRef, useState } from 'react';
import { Alert, View, StyleSheet, Modal, StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
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
  SearchScreen,
  PlayerScreen,
  LibraryScreen,
  PlaylistDetailScreen,
  FavoritesScreen,
  DownloadsScreen,
  SettingsScreen,
} from '../screens';
import { usePlayerStore } from '../stores';

import type {
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

// ─── Stack Navigators ──────────────────────────────────────────

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
    </HomeStack.Navigator>
  );
}

function SearchStackNavigator() {
  return (
    <SearchStack.Navigator screenOptions={{ headerShown: false }}>
      <SearchStack.Screen name="Search" component={SearchScreen} />
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
    </LibraryStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
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
    Alert.alert('Playback Error', playerError, [
      {
        text: 'OK',
        onPress: () => {
          shownErrorRef.current = null;
          clearPlayerError(null);
        },
      },
    ]);
  }, [clearPlayerError, playerError]);

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
    <NavigationContainer theme={navigationTheme}>
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
        <PlayerScreen onDismiss={() => setPlayerVisible(false)} />
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
