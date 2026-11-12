import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Clock, X, TrendingUp, Search, Link } from 'lucide-react-native';
import { SearchBar, TrackItem, MediaRow, TrackOptionsModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useSearchStore, usePlayerStore } from '../stores';
import type { SearchFilter, SearchItem } from '../stores/searchStore';
import { parseCollectionLink } from '../services/musicCatalog';
import { SearchStackParamList, Track } from '../types';

const SUGGESTION_DEBOUNCE_MS = 250;

const FILTERS: { value: SearchFilter; label: string }[] = [
  { value: 'songs', label: 'Songs' },
  { value: 'videos', label: 'Videos' },
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
  { value: 'playlists', label: 'Playlists' },
];

export function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const query = useSearchStore((s) => s.query);
  const submittedQuery = useSearchStore((s) => s.submittedQuery);
  const filter = useSearchStore((s) => s.filter);
  const results = useSearchStore((s) => s.results);
  const suggestions = useSearchStore((s) => s.suggestions);
  const searchHistory = useSearchStore((s) => s.searchHistory);
  const isSearching = useSearchStore((s) => s.isSearching);
  const error = useSearchStore((s) => s.error);
  const setQuery = useSearchStore((s) => s.setQuery);
  const search = useSearchStore((s) => s.search);
  const setFilter = useSearchStore((s) => s.setFilter);
  const loadSuggestions = useSearchStore((s) => s.loadSuggestions);
  const clearResults = useSearchStore((s) => s.clearResults);
  const removeFromHistory = useSearchStore((s) => s.removeFromHistory);
  const clearHistory = useSearchStore((s) => s.clearHistory);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [isFocused, setIsFocused] = useState(false);
  const [optionsTrack, setOptionsTrack] = useState<Track | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const typedQuery = query.trim();
  const showHistory = typedQuery.length === 0;
  // Typing something new: suggest completions until it is searched for
  const showSuggestions =
    !showHistory && typedQuery !== submittedQuery && (isFocused || !submittedQuery);
  const showResults = !showHistory && !showSuggestions;
  const pastedLink = showSuggestions ? parseCollectionLink(typedQuery) : null;

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
      debounceRef.current = setTimeout(() => {
        loadSuggestions(text);
      }, SUGGESTION_DEBOUNCE_MS);
    },
    [loadSuggestions, setQuery]
  );

  /** Search for the text, or open it when it is a playlist / album link. */
  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      Keyboard.dismiss();

      const link = parseCollectionLink(trimmed);
      if (link) {
        navigation.push('Collection', link);
        return;
      }
      search(trimmed);
    },
    [navigation, search]
  );

  const handleTrackPress = useCallback(
    async (track: Track) => {
      Keyboard.dismiss();
      setLoadingTrackId(track.id);
      try {
        await playTrack(track);
      } finally {
        setLoadingTrackId(null);
      }
    },
    [playTrack]
  );

  const renderResult = useCallback(
    ({ item }: { item: SearchItem }) => {
      switch (item.type) {
        case 'track':
          return (
            <TrackItem
              track={item.track}
              onPress={() => handleTrackPress(item.track)}
              onMorePress={() => setOptionsTrack(item.track)}
              isPlaying={currentTrack?.id === item.id}
              isLoading={loadingTrackId === item.id}
            />
          );
        case 'album':
          return (
            <MediaRow
              imageUrl={item.album.thumbnailUrl}
              title={item.album.title}
              subtitle={item.album.subtitle}
              onPress={() =>
                navigation.push('Collection', {
                  kind: 'album',
                  id: item.id,
                  title: item.album.title,
                })
              }
            />
          );
        case 'artist':
          return (
            <MediaRow
              imageUrl={item.artist.thumbnailUrl}
              title={item.artist.name}
              subtitle={item.artist.subtitle}
              round
              onPress={() =>
                navigation.push('Artist', { artistId: item.id, name: item.artist.name })
              }
            />
          );
        case 'playlist':
          return (
            <MediaRow
              imageUrl={item.playlist.thumbnailUrl}
              title={item.playlist.title}
              subtitle={item.playlist.subtitle}
              onPress={() =>
                navigation.push('Collection', {
                  kind: 'playlist',
                  id: item.id,
                  title: item.playlist.title,
                })
              }
            />
          );
      }
    },
    [currentTrack?.id, handleTrackPress, loadingTrackId, navigation]
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
        onSubmit={() => submit(query)}
        onClear={clearResults}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Songs, artists, albums or a playlist link"
        autoFocus={false}
      />

      {/* Search History */}
      {showHistory && searchHistory.length > 0 && (
        <ScrollView
          style={styles.historyContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        >
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
          {searchHistory.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.historyItem}
              onPress={() => submit(item)}
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
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item} from recent searches`}
              >
                <X size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Empty state before the first search */}
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
            Find songs, albums, artists and playlists, or paste a YouTube playlist link
          </Text>
        </View>
      )}

      {/* Suggestions while typing */}
      {showSuggestions && (
        <ScrollView
          style={styles.historyContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        >
          {pastedLink ? (
            <TouchableOpacity style={styles.historyItem} onPress={() => submit(typedQuery)}>
              <Link size={16} color={theme.primary} />
              <Text style={[typography.body, { color: theme.primary, flex: 1 }]}>
                Open this {pastedLink.kind}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.historyItem} onPress={() => submit(typedQuery)}>
              <Search size={16} color={theme.primary} />
              <Text
                numberOfLines={1}
                style={[typography.body, { color: theme.primary, flex: 1 }]}
              >
                Search for “{typedQuery}”
              </Text>
            </TouchableOpacity>
          )}
          {!pastedLink &&
            suggestions
              .filter((suggestion) => suggestion.toLowerCase() !== typedQuery.toLowerCase())
              .map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.historyItem}
                  onPress={() => submit(suggestion)}
                >
                  <Search size={16} color={theme.textTertiary} />
                  <Text
                    numberOfLines={1}
                    style={[typography.body, { color: theme.text, flex: 1 }]}
                  >
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
        </ScrollView>
      )}

      {/* Result type */}
      {showResults && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map(({ value, label }) => {
              const selected = filter === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setFilter(value)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: selected ? theme.primary : theme.card },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Show ${label.toLowerCase()}`}
                >
                  <Text
                    style={[
                      typography.footnote,
                      { color: selected ? '#FFF' : theme.text, fontWeight: '600' },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Loading */}
      {showResults && isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[typography.footnote, { color: theme.textSecondary, marginTop: spacing.sm }]}>
            Searching...
          </Text>
        </View>
      )}

      {/* Error */}
      {showResults && error && !isSearching && (
        <View style={styles.errorContainer}>
          <Text style={[typography.body, { color: theme.danger, textAlign: 'center' }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => search(submittedQuery)}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {showResults && !isSearching && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          renderItem={renderResult}
          contentContainerStyle={{
            paddingBottom: MINI_PLAYER_HEIGHT + 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* No results */}
      {showResults && !isSearching && results.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            No results found
          </Text>
        </View>
      )}

      <TrackOptionsModal
        visible={!!optionsTrack}
        track={optionsTrack}
        onClose={() => setOptionsTrack(null)}
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
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
});
