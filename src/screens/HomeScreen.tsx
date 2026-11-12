import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shuffle,
  Clock,
  Heart,
  TrendingUp,
} from 'lucide-react-native';
import { TrackItem, PlaylistCard, MediaCard, TrackOptionsModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import {
  usePlayerStore,
  useLibraryStore,
  useHistoryStore,
  useHomeStore,
} from '../stores';
import {
  getListenAgain,
  getForgottenFavorites,
  primaryArtist,
  createTaste,
} from '../services/recommendations';
import { Track } from '../types';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

const QUICK_PICK_ROWS = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface TrackRowSectionProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  currentTrackId?: string;
  onPressTrack: (tracks: Track[], index: number) => void;
  /** Long-press on a card. */
  onTrackOptions: (track: Track) => void;
}

/** A titled, horizontally scrolling row of track cards. */
function TrackRowSection({
  title,
  subtitle,
  tracks,
  currentTrackId,
  onPressTrack,
  onTrackOptions,
}: TrackRowSectionProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle}>
        {!!subtitle && (
          <Text
            style={[
              typography.caption1,
              { color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
            ]}
          >
            {subtitle}
          </Text>
        )}
        <Text numberOfLines={1} style={[typography.title2, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      <FlatList
        horizontal
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MediaCard
            imageUrl={item.localThumbnailPath || item.thumbnailUrl}
            title={item.title}
            subtitle={item.artist}
            active={currentTrackId === item.id}
            onPress={() => onPressTrack(tracks, index)}
            onLongPress={() => onTrackOptions(item)}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg }}
      />
    </View>
  );
}

export function HomeScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const shufflePlay = usePlayerStore((s) => s.shufflePlay);
  const favorites = useLibraryStore((s) => s.favorites);
  const playlists = useLibraryStore((s) => s.playlists);
  const historyStats = useHistoryStore((s) => s.stats);
  const notInterested = useHistoryStore((s) => s.notInterested);
  const quickPicks = useHomeStore((s) => s.quickPicks);
  const mixes = useHomeStore((s) => s.mixes);
  const becauseYouListened = useHomeStore((s) => s.becauseYouListened);
  const isLoadingRecommendations = useHomeStore((s) => s.isLoading);
  const refreshRecommendations = useHomeStore((s) => s.refresh);
  const refreshIfStale = useHomeStore((s) => s.refreshIfStale);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [optionsTrack, setOptionsTrack] = useState<Track | null>(null);

  const greeting = getGreeting();

  // Rebuild recommendations when the tab is opened and they are getting old
  useFocusEffect(
    useCallback(() => {
      refreshIfStale();
    }, [refreshIfStale])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshRecommendations({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshRecommendations]);

  const handlePlayFrom = useCallback(
    (tracks: Track[], index: number) => {
      playQueue(tracks, index);
    },
    [playQueue]
  );

  const taste = useMemo(
    () => createTaste(historyStats, favorites, notInterested),
    [historyStats, favorites, notInterested]
  );
  const listenAgain = useMemo(() => getListenAgain(taste, Date.now()), [taste]);
  const forgottenFavorites = useMemo(
    () => getForgottenFavorites(taste, Date.now()),
    [taste]
  );
  const quickPickColumns = useMemo(
    () => chunk(quickPicks, QUICK_PICK_ROWS),
    [quickPicks]
  );
  // Narrower than the screen so the next column peeks in
  const quickPickColumnWidth = SCREEN_WIDTH - spacing.huge;

  const hasRecommendations =
    quickPicks.length > 0 || mixes.length > 0 || becauseYouListened != null;
  const hasAnything =
    recentlyPlayed.length > 0 ||
    favorites.length > 0 ||
    playlists.length > 0 ||
    listenAgain.length > 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
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
                onPress={() => playQueue(recentlyPlayed)}
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

        {/* First load of recommendations */}
        {isLoadingRecommendations && !hasRecommendations && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[typography.footnote, { color: theme.textSecondary }]}>
              Picking songs for you…
            </Text>
          </View>
        )}

        {/* Quick Picks */}
        {quickPicks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Quick Picks
              </Text>
              <TouchableOpacity
                onPress={() => playQueue(quickPicks)}
                style={[styles.pillButton, { backgroundColor: theme.primary }]}
                accessibilityRole="button"
                accessibilityLabel="Play all quick picks"
              >
                <Text style={[typography.caption1, { color: '#FFF', fontWeight: '600' }]}>
                  Play All
                </Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={quickPickColumns}
              keyExtractor={(column) => column[0].id}
              renderItem={({ item: column, index: columnIndex }) => (
                <View style={{ width: quickPickColumnWidth }}>
                  {column.map((track, rowIndex) => (
                    <TrackItem
                      key={track.id}
                      track={track}
                      onPress={() =>
                        handlePlayFrom(
                          quickPicks,
                          columnIndex * QUICK_PICK_ROWS + rowIndex
                        )
                      }
                      onMorePress={() => setOptionsTrack(track)}
                      isPlaying={currentTrack?.id === track.id}
                      compact
                    />
                  ))}
                </View>
              )}
              snapToInterval={quickPickColumnWidth}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {/* Mixes */}
        {mixes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Mixes for You
              </Text>
            </View>
            <FlatList
              horizontal
              data={mixes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MediaCard
                  imageUrl={item.coverUrl}
                  title={item.title}
                  subtitle={item.subtitle}
                  size={160}
                  onPress={() => navigation.navigate('MixDetail', { mixId: item.id })}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            />
          </View>
        )}

        {/* Listen Again */}
        {listenAgain.length > 0 && (
          <TrackRowSection
            title="Listen Again"
            tracks={listenAgain}
            currentTrackId={currentTrack?.id}
            onPressTrack={handlePlayFrom}
            onTrackOptions={setOptionsTrack}
          />
        )}

        {/* Because You Listened To */}
        {becauseYouListened && becauseYouListened.tracks.length > 0 && (
          <TrackRowSection
            subtitle="Because you listened to"
            title={`${becauseYouListened.seed.title} · ${primaryArtist(
              becauseYouListened.seed.artist
            )}`}
            tracks={becauseYouListened.tracks}
            currentTrackId={currentTrack?.id}
            onPressTrack={handlePlayFrom}
            onTrackOptions={setOptionsTrack}
          />
        )}

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
          <TrackRowSection
            title="Recently Played"
            tracks={recentlyPlayed.slice(0, 10)}
            currentTrackId={currentTrack?.id}
            onPressTrack={handlePlayFrom}
            onTrackOptions={setOptionsTrack}
          />
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

        {/* Forgotten Favourites */}
        {forgottenFavorites.length > 0 && (
          <TrackRowSection
            title="Forgotten Favourites"
            tracks={forgottenFavorites}
            currentTrackId={currentTrack?.id}
            onPressTrack={handlePlayFrom}
            onTrackOptions={setOptionsTrack}
          />
        )}

        {/* Favorites Quick Play */}
        {favorites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Liked Songs
              </Text>
              <TouchableOpacity
                onPress={() => shufflePlay(favorites)}
                style={[styles.pillButton, { backgroundColor: theme.primary }]}
              >
                <Shuffle size={14} color="#FFF" />
                <Text style={[typography.caption1, { color: '#FFF', fontWeight: '600' }]}>
                  Shuffle
                </Text>
              </TouchableOpacity>
            </View>
            {favorites.slice(0, 10).map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                showIndex
                onPress={() => playQueue(favorites, index)}
                onMorePress={() => setOptionsTrack(track)}
                isPlaying={currentTrack?.id === track.id}
                compact
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {!hasAnything && !hasRecommendations && (
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
              Search for your favorite music and start listening. Recommendations based on what you play will appear here.
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

      <TrackOptionsModal
        visible={!!optionsTrack}
        track={optionsTrack}
        onClose={() => setOptionsTrack(null)}
      />
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
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
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  pillButton: {
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
