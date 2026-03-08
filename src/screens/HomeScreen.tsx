import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Play,
  Shuffle,
  Clock,
  Heart,
  TrendingUp,
} from 'lucide-react-native';
import { TrackItem, PlaylistCard } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { usePlayerStore, useLibraryStore } from '../stores';
import { Track } from '../types';
import { useNavigation } from '@react-navigation/native';

export function HomeScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const favorites = useLibraryStore((s) => s.favorites);
  const playlists = useLibraryStore((s) => s.playlists);

  const greeting = getGreeting();

  const handlePlayTrack = useCallback(async (track: Track) => {
    await playTrack(track);
    const playerError = usePlayerStore.getState().error;
    if (playerError) {
      Alert.alert(
        'Playback Error',
        playerError,
        [{ text: 'OK', onPress: () => usePlayerStore.getState().setError(null) }]
      );
    }
  }, [playTrack]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[typography.largeTitle, { color: theme.text }]}>
            {greeting}
          </Text>
        </View>

        {/* Quick Actions */}
        {(favorites.length > 0 || recentlyPlayed.length > 0) && (
          <View style={styles.quickActions}>
            {favorites.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.quickActionCard,
                  { backgroundColor: theme.card },
                ]}
                onPress={() =>
                  navigation.navigate('LibraryTab', {
                    screen: 'Favorites',
                  })
                }
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: theme.accent + '20' },
                  ]}
                >
                  <Heart size={18} color={theme.accent} fill={theme.accent} />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.footnote,
                    { color: theme.text, fontWeight: '600', flex: 1 },
                  ]}
                >
                  Liked Songs
                </Text>
              </TouchableOpacity>
            )}

            {recentlyPlayed.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.quickActionCard,
                  { backgroundColor: theme.card },
                ]}
                onPress={() => {
                  if (recentlyPlayed.length > 0) {
                    playQueue(recentlyPlayed);
                  }
                }}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    { backgroundColor: theme.primary + '20' },
                  ]}
                >
                  <Clock size={18} color={theme.primary} />
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.footnote,
                    { color: theme.text, fontWeight: '600', flex: 1 },
                  ]}
                >
                  Recently Played
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Recently Played
              </Text>
              {recentlyPlayed.length > 5 && (
                <TouchableOpacity>
                  <Text style={[typography.subheadline, { color: theme.primary }]}>
                    See All
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              horizontal
              data={recentlyPlayed.slice(0, 10)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.recentCard}
                  onPress={() => handlePlayTrack(item)}
                  activeOpacity={0.7}
                >
                  <Image
                    source={{
                      uri: item.localThumbnailPath || item.thumbnailUrl,
                    }}
                    style={[
                      styles.recentImage,
                      { borderRadius: borderRadius.md, backgroundColor: theme.card },
                    ]}
                  />
                  <Text
                    numberOfLines={2}
                    style={[
                      typography.caption1,
                      {
                        color: theme.text,
                        fontWeight: '500',
                        marginTop: spacing.sm,
                      },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.caption2,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.artist}
                  </Text>
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            />
          </View>
        )}

        {/* Your Playlists */}
        {playlists.length > 0 && (
          <View style={styles.section}>
            <Text
              style={[
                typography.title2,
                { color: theme.text, paddingHorizontal: spacing.lg },
              ]}
            >
              Your Playlists
            </Text>
            <FlatList
              horizontal
              data={playlists}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PlaylistCard
                  playlist={item}
                  onPress={() =>
                    navigation.navigate('LibraryTab', {
                      screen: 'PlaylistDetail',
                      params: { playlistId: item.id },
                    })
                  }
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              }}
            />
          </View>
        )}

        {/* Favorites Quick Play */}
        {favorites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Liked Songs
              </Text>
              <TouchableOpacity
                onPress={() => playQueue(favorites)}
                style={[styles.shuffleButton, { backgroundColor: theme.primary }]}
              >
                <Shuffle size={14} color="#FFF" />
                <Text style={[typography.caption1, { color: '#FFF', fontWeight: '600' }]}>
                  Shuffle
                </Text>
              </TouchableOpacity>
            </View>
            {favorites.slice(0, 5).map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                showIndex
                onPress={() => playQueue(favorites, index)}
                isPlaying={currentTrack?.id === track.id}
                compact
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {recentlyPlayed.length === 0 && favorites.length === 0 && playlists.length === 0 && (
          <View style={styles.emptyState}>
            <TrendingUp size={64} color={theme.textTertiary} />
            <Text
              style={[
                typography.title2,
                { color: theme.textSecondary, marginTop: spacing.xl },
              ]}
            >
              Welcome to MusicPlayer
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: theme.textTertiary,
                  textAlign: 'center',
                  marginTop: spacing.sm,
                  paddingHorizontal: spacing.xxl,
                },
              ]}
            >
              Search for your favorite music and start listening. Your recently played songs and playlists will appear here.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('SearchTab')}
              style={[
                styles.getStartedButton,
                { backgroundColor: theme.primary },
              ]}
            >
              <Text style={[typography.headline, { color: '#FFF' }]}>
                Start Searching
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickActionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  recentCard: {
    width: 140,
    marginRight: spacing.md,
  },
  recentImage: {
    width: 140,
    height: 140,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  getStartedButton: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.full,
  },
});
