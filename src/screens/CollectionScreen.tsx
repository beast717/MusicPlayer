import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Play, Shuffle, ListPlus, Check, Music } from 'lucide-react-native';
import { TrackItem, TrackOptionsModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useLibraryStore, usePlayerStore } from '../stores';
import { getCollection } from '../services/musicCatalog';
import { Collection, CollectionScreenProps, Track } from '../types';

const COVER_SIZE = 180;

/** An album or a YouTube playlist: play it, or save it to the library as a playlist. */
export function CollectionScreen({ route, navigation }: CollectionScreenProps) {
  const { theme } = useTheme();
  const { kind, id, title: fallbackTitle } = route.params;
  const playQueue = usePlayerStore((s) => s.playQueue);
  const shufflePlay = usePlayerStore((s) => s.shufflePlay);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const importPlaylist = useLibraryStore((s) => s.importPlaylist);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [optionsTrack, setOptionsTrack] = useState<Track | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCollection(null);
    setError(null);
    setIsSaved(false);

    getCollection(kind, id).then(
      (loaded) => {
        if (!cancelled) setCollection(loaded);
      },
      (err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(
          /could not be (opened|found)/.test(message)
            ? message
            : `Could not load this ${kind}. Check your internet connection and try again.`
        );
      }
    );

    return () => {
      cancelled = true;
    };
  }, [kind, id, attempt]);

  const title =
    collection?.title || fallbackTitle || (kind === 'album' ? 'Album' : 'Playlist');
  const tracks = collection?.tracks ?? [];

  const handleSave = () => {
    if (!collection || tracks.length === 0 || isSaved) return;
    importPlaylist(title, tracks, collection.coverUrl);
    setIsSaved(true);
    Alert.alert(
      'Saved',
      `"${title}" was added to your playlists with ${tracks.length} ${
        tracks.length === 1 ? 'song' : 'songs'
      }.`
    );
  };

  const header = collection && (
    <View style={styles.info}>
      <View style={[styles.cover, { backgroundColor: theme.card }]}>
        {collection.coverUrl ? (
          <Image source={{ uri: collection.coverUrl }} style={styles.coverImage} />
        ) : (
          <Music size={48} color={theme.textTertiary} />
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[typography.title2, { color: theme.text, textAlign: 'center' }]}
      >
        {title}
      </Text>
      {!!collection.subtitle &&
        (collection.artistId ? (
          <TouchableOpacity
            onPress={() =>
              navigation.push('Artist', {
                artistId: collection.artistId,
                name: collection.artistName ?? '',
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Go to ${collection.artistName}`}
          >
            <Text style={[typography.footnote, { color: theme.primary, textAlign: 'center' }]}>
              {collection.subtitle}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text
            style={[typography.footnote, { color: theme.textSecondary, textAlign: 'center' }]}
          >
            {collection.subtitle}
          </Text>
        ))}
      <Text style={[typography.caption1, { color: theme.textTertiary }]}>
        {collection.isTruncated ? 'First ' : ''}
        {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
      </Text>

      {tracks.length > 0 && (
        <View style={styles.playActions}>
          <TouchableOpacity
            onPress={() => playQueue(tracks)}
            style={[styles.playButton, { backgroundColor: theme.primary }]}
          >
            <Play size={18} color="#FFF" fill="#FFF" />
            <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
              Play All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => shufflePlay(tracks)}
            style={[
              styles.playButton,
              {
                backgroundColor: 'transparent',
                borderColor: theme.primary,
                borderWidth: 1.5,
              },
            ]}
          >
            <Shuffle size={18} color={theme.primary} />
            <Text
              style={[typography.subheadline, { color: theme.primary, fontWeight: '600' }]}
            >
              Shuffle
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        {tracks.length > 0 && (
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaved}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Saved to library' : 'Save to library'}
          >
            {isSaved ? (
              <Check size={22} color={theme.success} />
            ) : (
              <ListPlus size={22} color={theme.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Loading */}
      {!collection && !error && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      )}

      {/* Error */}
      {!!error && (
        <View style={styles.centered}>
          <Text style={[typography.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => setAttempt((n) => n + 1)}
            style={[styles.playButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {collection && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <TrackItem
              track={item}
              index={index}
              showIndex
              onPress={() => playQueue(tracks, index)}
              onMorePress={() => setOptionsTrack(item)}
              isPlaying={currentTrack?.id === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={[typography.body, { color: theme.textSecondary }]}>
                No playable songs here.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
          showsVerticalScrollIndicator={false}
        />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  info: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  coverImage: {
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  playActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
  },
});
