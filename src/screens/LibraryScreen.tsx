import React, { useState, useCallback, useMemo } from 'react';
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
  Heart,
  Download,
  ListMusic,
  Plus,
  ChevronRight,
  Music,
} from 'lucide-react-native';
import { PlaylistCard, TextInputModal } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useLibraryStore, usePlayerStore } from '../stores';
import { useNavigation } from '@react-navigation/native';

export function LibraryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const playlists = useLibraryStore((s) => s.playlists);
  const favorites = useLibraryStore((s) => s.favorites);
  const downloadedTracks = useLibraryStore((s) => s.downloadedTracks);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);

  const [showCreateInput, setShowCreateInput] = useState(false);

  const handleCreatePlaylist = useCallback(() => {
    setShowCreateInput(true);
  }, []);

  const handleCreateSubmit = useCallback(
    (name: string) => {
      createPlaylist(name);
      setShowCreateInput(false);
    },
    [createPlaylist]
  );

  const handleDeletePlaylist = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        'Delete Playlist',
        `Are you sure you want to delete "${name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deletePlaylist(id),
          },
        ]
      );
    },
    [deletePlaylist]
  );

  const sections = useMemo(
    () => [
      {
        id: 'favorites',
        icon: Heart,
        iconColor: theme.accent,
        iconBg: theme.accent + '20',
        label: 'Liked Songs',
        count: favorites.length,
        onPress: () => navigation.navigate('Favorites'),
      },
      {
        id: 'downloads',
        icon: Download,
        iconColor: theme.success,
        iconBg: theme.success + '20',
        label: 'Downloads',
        count: downloadedTracks.length,
        onPress: () => navigation.navigate('Downloads'),
      },
    ],
    [favorites.length, downloadedTracks.length, theme, navigation]
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      <FlatList
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[typography.largeTitle, { color: theme.text }]}>
                Library
              </Text>
            </View>

            {/* Quick Sections */}
            {sections.map((section) => (
              <TouchableOpacity
                key={section.id}
                style={[styles.sectionRow, { borderBottomColor: theme.border }]}
                onPress={section.onPress}
              >
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: section.iconBg },
                  ]}
                >
                  <section.icon
                    size={20}
                    color={section.iconColor}
                    fill={section.id === 'favorites' ? section.iconColor : 'none'}
                  />
                </View>
                <Text
                  style={[
                    typography.body,
                    { color: theme.text, fontWeight: '500', flex: 1 },
                  ]}
                >
                  {section.label}
                </Text>
                <Text
                  style={[typography.footnote, { color: theme.textTertiary }]}
                >
                  {section.count}
                </Text>
                <ChevronRight size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}

            {/* Playlists Header */}
            <View style={styles.playlistsHeader}>
              <Text style={[typography.title2, { color: theme.text }]}>
                Playlists
              </Text>
              <TouchableOpacity
                onPress={handleCreatePlaylist}
                style={[styles.addButton, { backgroundColor: theme.primary + '15' }]}
              >
                <Plus size={18} color={theme.primary} />
                <Text
                  style={[
                    typography.subheadline,
                    { color: theme.primary, fontWeight: '600' },
                  ]}
                >
                  New
                </Text>
              </TouchableOpacity>
            </View>
          </>
        }
        data={playlists}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.playlistRow, { borderBottomColor: theme.border }]}
            onPress={() =>
              navigation.navigate('PlaylistDetail', { playlistId: item.id })
            }
            onLongPress={() => handleDeletePlaylist(item.id, item.name)}
          >
            <View
              style={[
                styles.playlistThumb,
                { backgroundColor: theme.card },
              ]}
            >
              {item.coverUrl || item.tracks[0]?.thumbnailUrl ? (
                <View style={styles.playlistThumbImage}>
                  {/* We'd use an Image here but simple icon for now */}
                  <Music size={20} color={theme.textSecondary} />
                </View>
              ) : (
                <Music size={20} color={theme.textSecondary} />
              )}
            </View>
            <View style={styles.playlistInfo}>
              <Text
                numberOfLines={1}
                style={[typography.body, { color: theme.text, fontWeight: '500' }]}
              >
                {item.name}
              </Text>
              <Text
                style={[typography.caption1, { color: theme.textSecondary }]}
              >
                {item.tracks.length} {item.tracks.length === 1 ? 'song' : 'songs'}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyPlaylists}>
            <ListMusic size={40} color={theme.textTertiary} />
            <Text
              style={[
                typography.body,
                { color: theme.textTertiary, marginTop: spacing.md },
              ]}
            >
              No playlists yet
            </Text>
            <Text
              style={[
                typography.footnote,
                { color: theme.textTertiary, textAlign: 'center' },
              ]}
            >
              Create a playlist to organize your music
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
      />

      <TextInputModal
        visible={showCreateInput}
        title="New Playlist"
        message="Enter a name for your playlist"
        placeholder="Playlist name"
        submitLabel="Create"
        onSubmit={handleCreateSubmit}
        onCancel={() => setShowCreateInput(false)}
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
    paddingBottom: spacing.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playlistThumb: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistThumbImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
    gap: 2,
  },
  emptyPlaylists: {
    alignItems: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xxl,
    gap: spacing.xs,
  },
});
