import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, X, TrendingUp } from 'lucide-react-native';
import { SearchBar, TrackItem, AddToPlaylistModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useSearchStore, usePlayerStore } from '../stores';
import { Track, SearchResult } from '../types';
import { SEARCH_DEBOUNCE_MS } from '../utils/constants';

export function SearchScreen() {
  const { theme } = useTheme();
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const searchHistory = useSearchStore((s) => s.searchHistory);
  const isSearching = useSearchStore((s) => s.isSearching);
  const error = useSearchStore((s) => s.error);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const clearResults = useSearchStore((s) => s.clearResults);
  const removeFromHistory = useSearchStore((s) => s.removeFromHistory);
  const clearHistory = useSearchStore((s) => s.clearHistory);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isLoading = usePlayerStore((s) => s.isLoading);

  const [isFocused, setIsFocused] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showHistory = isFocused && query.length === 0 && results.length === 0;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (text.trim().length > 1) {
        debounceRef.current = setTimeout(() => {
          search(text.trim());
        }, SEARCH_DEBOUNCE_MS);
      }
    },
    [search, setQuery]
  );

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (query.trim()) {
      search(query.trim());
    }
  }, [query, search]);

  const handleResultPress = useCallback(
    async (item: SearchResult) => {
      Keyboard.dismiss();
      const track: Track = {
        id: item.videoId,
        title: item.title,
        artist: item.uploaderName,
        duration: item.duration,
        thumbnailUrl: item.thumbnailUrl,
      };
      setLoadingTrackId(item.videoId);
      await playTrack(track);
      setLoadingTrackId(null);

      // Check if playback failed and show error to the user
      const playerError = usePlayerStore.getState().error;
      if (playerError) {
        Alert.alert(
          'Playback Error',
          playerError,
          [{ text: 'OK', onPress: () => usePlayerStore.getState().setError(null) }]
        );
      }
    },
    [playTrack]
  );

  const handleHistoryPress = useCallback(
    (historyQuery: string) => {
      setQuery(historyQuery);
      search(historyQuery);
      Keyboard.dismiss();
    },
    [search, setQuery]
  );

  const handleMorePress = useCallback(
    (item: SearchResult) => {
      const track: Track = {
        id: item.videoId,
        title: item.title,
        artist: item.uploaderName,
        duration: item.duration,
        thumbnailUrl: item.thumbnailUrl,
      };
      setPlaylistTrack(track);
    },
    []
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typography.largeTitle, { color: theme.text }]}>
          Search
        </Text>
      </View>

      {/* Search Bar */}
      <SearchBar
        value={query}
        onChangeText={handleQueryChange}
        onSubmit={handleSearchSubmit}
        onClear={clearResults}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoFocus={false}
      />

      {/* Loading */}
      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[typography.footnote, { color: theme.textSecondary, marginTop: spacing.sm }]}>
            Searching...
          </Text>
        </View>
      )}

      {/* Error */}
      {error && !isSearching && (
        <View style={styles.errorContainer}>
          <Text style={[typography.body, { color: theme.danger, textAlign: 'center' }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => search(query)}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search History */}
      {showHistory && searchHistory.length > 0 && (
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={[typography.headline, { color: theme.text }]}>
              Recent Searches
            </Text>
            <TouchableOpacity onPress={clearHistory}>
              <Text style={[typography.subheadline, { color: theme.primary }]}>
                Clear All
              </Text>
            </TouchableOpacity>
          </View>
          {searchHistory.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.historyItem}
              onPress={() => handleHistoryPress(item)}
            >
              <Clock size={16} color={theme.textTertiary} />
              <Text
                style={[
                  typography.body,
                  { color: theme.text, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {item}
              </Text>
              <TouchableOpacity
                onPress={() => removeFromHistory(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Empty state when focused but no history */}
      {showHistory && searchHistory.length === 0 && (
        <View style={styles.emptyState}>
          <TrendingUp size={48} color={theme.textTertiary} />
          <Text style={[typography.title3, { color: theme.textSecondary, marginTop: spacing.lg }]}>
            Search for music
          </Text>
          <Text
            style={[
              typography.body,
              { color: theme.textTertiary, textAlign: 'center', marginTop: spacing.sm },
            ]}
          >
            Find songs from YouTube and play them directly
          </Text>
        </View>
      )}

      {/* Results */}
      {!isSearching && !showHistory && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.videoId}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              onPress={() => handleResultPress(item)}
              onMorePress={() => handleMorePress(item)}
              isPlaying={currentTrack?.id === item.videoId}
              isLoading={loadingTrackId === item.videoId}
            />
          )}
          contentContainerStyle={{
            paddingBottom: MINI_PLAYER_HEIGHT + 20,
            paddingTop: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* No results */}
      {!isSearching && !showHistory && results.length === 0 && query.length > 0 && !error && (
        <View style={styles.emptyState}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            No results found
          </Text>
        </View>
      )}

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  retryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.full,
  },
  historyContainer: {
    paddingTop: spacing.lg,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
});
