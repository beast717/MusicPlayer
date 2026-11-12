import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Play, Shuffle, User } from 'lucide-react-native';
import { TrackItem, MediaCard, TrackOptionsModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { usePlayerStore } from '../stores';
import { getArtist, findArtistByName } from '../services/musicCatalog';
import { AlbumSummary, ArtistPage, ArtistScreenProps, Track } from '../types';

const AVATAR_SIZE = 140;

export function ArtistScreen({ route, navigation }: ArtistScreenProps) {
  const { theme } = useTheme();
  const { artistId, name } = route.params;
  const playQueue = usePlayerStore((s) => s.playQueue);
  const shufflePlay = usePlayerStore((s) => s.shufflePlay);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [artist, setArtist] = useState<ArtistPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [optionsTrack, setOptionsTrack] = useState<Track | null>(null);

  useEffect(() => {
    let cancelled = false;
    setArtist(null);
    setError(null);

    (async () => {
      try {
        // Songs from the history or from plain YouTube only know the artist's name
        const id = artistId ?? (await findArtistByName(name))?.id;
        if (!id) throw new Error(`"${name}" was not found on YouTube Music.`);
        const page = await getArtist(id);
        if (!cancelled) setArtist(page);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(
          /not found|could not be found/.test(message)
            ? message
            : 'Could not load this artist. Check your internet connection and try again.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistId, name, attempt]);

  const openAlbum = useCallback(
    (album: AlbumSummary) =>
      navigation.push('Collection', { kind: 'album', id: album.id, title: album.title }),
    [navigation]
  );

  const renderAlbumRow = (title: string, albums: AlbumSummary[]) =>
    albums.length > 0 && (
      <View style={styles.section}>
        <Text style={[typography.title2, styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        <FlatList
          horizontal
          data={albums}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MediaCard
              imageUrl={item.thumbnailUrl}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => openAlbum(item)}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg }}
        />
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
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {!artist && !error && (
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

      {artist && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        >
          {/* Artist Info */}
          <View style={styles.artistInfo}>
            <View style={[styles.avatar, { backgroundColor: theme.card }]}>
              {artist.thumbnailUrl ? (
                <Image source={{ uri: artist.thumbnailUrl }} style={styles.avatarImage} />
              ) : (
                <User size={48} color={theme.textTertiary} />
              )}
            </View>
            <Text
              numberOfLines={2}
              style={[typography.title1, { color: theme.text, textAlign: 'center' }]}
            >
              {artist.name}
            </Text>
            {!!artist.subtitle && (
              <Text style={[typography.footnote, { color: theme.textSecondary }]}>
                {artist.subtitle}
              </Text>
            )}

            {artist.topSongs.length > 0 && (
              <View style={styles.playActions}>
                <TouchableOpacity
                  onPress={() => playQueue(artist.topSongs)}
                  style={[styles.playButton, { backgroundColor: theme.primary }]}
                >
                  <Play size={18} color="#FFF" fill="#FFF" />
                  <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
                    Play
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shufflePlay(artist.topSongs)}
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
                    style={[
                      typography.subheadline,
                      { color: theme.primary, fontWeight: '600' },
                    ]}
                  >
                    Shuffle
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Top Songs */}
          {artist.topSongs.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[typography.title2, { color: theme.text }]}>Top Songs</Text>
                {!!artist.allSongsPlaylistId && (
                  <TouchableOpacity
                    onPress={() =>
                      navigation.push('Collection', {
                        kind: 'playlist',
                        id: artist.allSongsPlaylistId as string,
                        title: `${artist.name} · Songs`,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Show all songs by ${artist.name}`}
                  >
                    <Text style={[typography.subheadline, { color: theme.primary }]}>
                      Show All
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {artist.topSongs.map((track, index) => (
                <TrackItem
                  key={track.id}
                  track={track}
                  index={index}
                  showIndex
                  onPress={() => playQueue(artist.topSongs, index)}
                  onMorePress={() => setOptionsTrack(track)}
                  isPlaying={currentTrack?.id === track.id}
                />
              ))}
            </View>
          )}

          {renderAlbumRow('Albums', artist.albums)}
          {renderAlbumRow('Singles & EPs', artist.singles)}

          {/* Related Artists */}
          {artist.related.length > 0 && (
            <View style={styles.section}>
              <Text style={[typography.title2, styles.sectionTitle, { color: theme.text }]}>
                Fans Also Like
              </Text>
              <FlatList
                horizontal
                data={artist.related}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <MediaCard
                    imageUrl={item.thumbnailUrl}
                    title={item.name}
                    size={120}
                    round
                    onPress={() =>
                      navigation.push('Artist', { artistId: item.id, name: item.name })
                    }
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.lg }}
              />
            </View>
          )}

          {artist.topSongs.length === 0 &&
            artist.albums.length === 0 &&
            artist.singles.length === 0 && (
              <View style={styles.centered}>
                <Text style={[typography.body, { color: theme.textSecondary }]}>
                  No music found for this artist.
                </Text>
              </View>
            )}
        </ScrollView>
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  artistInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
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
  section: {
    marginTop: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
