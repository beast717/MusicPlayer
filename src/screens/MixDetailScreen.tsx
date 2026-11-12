import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Play, Shuffle, ListPlus } from 'lucide-react-native';
import { TrackItem, TrackOptionsModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useHomeStore, useLibraryStore, usePlayerStore } from '../stores';
import { MixDetailScreenProps, Track } from '../types';

export function MixDetailScreen({ route, navigation }: MixDetailScreenProps) {
  const { theme } = useTheme();
  const { mixId } = route.params;
  const mix = useHomeStore((s) => s.getMix(mixId));
  const playQueue = usePlayerStore((s) => s.playQueue);
  const shufflePlay = usePlayerStore((s) => s.shufflePlay);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const importPlaylist = useLibraryStore((s) => s.importPlaylist);

  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  if (!mix) {
    // Recommendations were refreshed and this mix no longer exists
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
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
        <View style={styles.emptyState}>
          <Text style={[typography.body, { color: theme.textSecondary }]}>
            This mix is no longer available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    importPlaylist(mix.title, mix.tracks, mix.coverUrl);
    Alert.alert('Saved', `"${mix.title}" was added to your playlists.`);
  };

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
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerAction}
          accessibilityRole="button"
          accessibilityLabel="Save as playlist"
        >
          <ListPlus size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Mix Info */}
      <View style={styles.mixInfo}>
        <Text style={[typography.title1, { color: theme.text }]}>{mix.title}</Text>
        <Text
          numberOfLines={1}
          style={[
            typography.footnote,
            { color: theme.textSecondary, marginTop: spacing.xs },
          ]}
        >
          {mix.subtitle ? `${mix.subtitle} and more · ` : ''}
          {mix.tracks.length} songs
        </Text>

        <View style={styles.playActions}>
          <TouchableOpacity
            onPress={() => playQueue(mix.tracks)}
            style={[styles.playButton, { backgroundColor: theme.primary }]}
          >
            <Play size={18} color="#FFF" fill="#FFF" />
            <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
              Play All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => shufflePlay(mix.tracks)}
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
      </View>

      {/* Tracks */}
      <FlatList
        data={mix.tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => playQueue(mix.tracks, index)}
            onMorePress={() => setPlaylistTrack(item)}
            isPlaying={currentTrack?.id === item.id}
          />
        )}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
      />

      <TrackOptionsModal
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerAction: {
    padding: spacing.xs,
  },
  mixInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
  },
});
