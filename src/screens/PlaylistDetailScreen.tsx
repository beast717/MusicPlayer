import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Play,
  Shuffle,
  Trash2,
  Edit3,
} from 'lucide-react-native';
import { TrackItem, AddToPlaylistModal, TextInputModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useLibraryStore, usePlayerStore } from '../stores';
import { PlaylistDetailScreenProps, Track } from '../types';
import { shuffleArray } from '../utils/helpers';

export function PlaylistDetailScreen({
  route,
  navigation,
}: PlaylistDetailScreenProps) {
  const { theme } = useTheme();
  const { playlistId } = route.params;
  const playlist = useLibraryStore((s) => s.getPlaylist(playlistId));
  const removeFromPlaylist = useLibraryStore((s) => s.removeFromPlaylist);
  const renamePlaylist = useLibraryStore((s) => s.renamePlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);

  if (!playlist) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Text style={[typography.body, { color: theme.textSecondary }]}>
          Playlist not found
        </Text>
      </SafeAreaView>
    );
  }

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      playQueue(playlist.tracks);
    }
  };

  const handleShuffleAll = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = shuffleArray(playlist.tracks);
      playQueue(shuffled);
    }
  };

  const handleRemoveTrack = (trackId: string, title: string) => {
    Alert.alert(
      'Remove Song',
      `Remove "${title}" from this playlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFromPlaylist(playlistId, trackId),
        },
      ]
    );
  };

  const handleRename = () => {
    setShowRenameModal(true);
  };

  const handleRenameSubmit = (name: string) => {
    renamePlaylist(playlistId, name);
    setShowRenameModal(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to delete "${playlist.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deletePlaylist(playlistId);
            navigation.goBack();
          },
        },
      ]
    );
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
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleRename} style={styles.headerAction}>
            <Edit3 size={20} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerAction}>
            <Trash2 size={20} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Playlist Info */}
      <View style={styles.playlistInfo}>
        <Text style={[typography.title1, { color: theme.text }]}>
          {playlist.name}
        </Text>
        <Text
          style={[
            typography.footnote,
            { color: theme.textSecondary, marginTop: spacing.xs },
          ]}
        >
          {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
        </Text>

        {/* Play / Shuffle buttons */}
        {playlist.tracks.length > 0 && (
          <View style={styles.playActions}>
            <TouchableOpacity
              onPress={handlePlayAll}
              style={[styles.playButton, { backgroundColor: theme.primary }]}
            >
              <Play size={18} color="#FFF" fill="#FFF" />
              <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
                Play All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShuffleAll}
              style={[
                styles.shuffleButton,
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

      {/* Tracks */}
      <FlatList
        data={playlist.tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => playQueue(playlist.tracks, index)}
            onMorePress={() => setPlaylistTrack(item)}
            onLongPress={() => handleRemoveTrack(item.id, item.title)}
            isPlaying={currentTrack?.id === item.id}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[typography.body, { color: theme.textTertiary }]}>
              No songs in this playlist yet.
            </Text>
            <Text style={[typography.footnote, { color: theme.textTertiary }]}>
              Search for songs and add them here!
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
      />

      <AddToPlaylistModal
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <TextInputModal
        visible={showRenameModal}
        title="Rename Playlist"
        message="Enter a new name"
        placeholder="Playlist name"
        defaultValue={playlist.name}
        submitLabel="Rename"
        onSubmit={handleRenameSubmit}
        onCancel={() => setShowRenameModal(false)}
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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerAction: {
    padding: spacing.xs,
  },
  playlistInfo: {
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
  shuffleButton: {
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
    gap: spacing.xs,
  },
});
