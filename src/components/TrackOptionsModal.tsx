import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Plus,
  X,
  Music,
  ListPlus,
  User,
  Radio,
  ThumbsDown,
  Undo2,
  ChevronLeft,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { useLibraryStore } from '../stores/libraryStore';
import { useHistoryStore } from '../stores/historyStore';
import { useHomeStore } from '../stores/homeStore';
import { usePlayerStore } from '../stores/playerStore';
import { getRadioTracks } from '../services/youtubeMusic';
import { primaryArtist } from '../services/recommendations';
import { CatalogStackParamList, Track } from '../types';

interface TrackOptionsModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
}

type Mode = 'menu' | 'playlist';

/** The "more" menu of a song: add to playlist, go to artist, start radio, not interested. */
export function TrackOptionsModal({ visible, track, onClose }: TrackOptionsModalProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<CatalogStackParamList>>();
  const playlists = useLibraryStore((s) => s.playlists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const isNotInterested = useHistoryStore((s) =>
    track ? s.notInterested[track.id] != null : false
  );

  const [mode, setMode] = useState<Mode>('menu');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [isLoadingRadio, setIsLoadingRadio] = useState(false);

  // Always open on the menu
  useEffect(() => {
    if (visible) {
      setMode('menu');
      setShowCreate(false);
      setNewName('');
    }
  }, [visible]);

  const handleAddToPlaylist = (playlistId: string) => {
    if (track) {
      addToPlaylist(playlistId, track);
      onClose();
    }
  };

  const handleCreate = () => {
    if (newName.trim()) {
      const playlist = createPlaylist(newName.trim());
      if (track) {
        addToPlaylist(playlist.id, track);
      }
      setNewName('');
      setShowCreate(false);
      onClose();
    }
  };

  const handleGoToArtist = () => {
    if (!track) return;
    onClose();
    navigation.push('Artist', {
      artistId: track.artistId,
      name: primaryArtist(track.artist) || track.artist,
    });
  };

  const handleStartRadio = async () => {
    if (!track || isLoadingRadio) return;
    setIsLoadingRadio(true);
    try {
      const radio = await getRadioTracks(track.id);
      // The radio normally starts with the song itself; make sure it does
      const queue = [track, ...radio.filter((t) => t.id !== track.id)];
      onClose();
      usePlayerStore.getState().playQueue(queue, 0, { shuffle: false });
    } catch {
      Alert.alert(
        'Radio Unavailable',
        'Could not load similar songs. Check your internet connection and try again.'
      );
    } finally {
      setIsLoadingRadio(false);
    }
  };

  const handleNotInterested = () => {
    if (!track) return;
    if (isNotInterested) {
      useHistoryStore.getState().undoNotInterested(track.id);
    } else {
      useHistoryStore.getState().markNotInterested(track.id);
      useHomeStore.getState().removeTrack(track.id);
      const player = usePlayerStore.getState();
      if (player.currentTrack?.id === track.id && player.queue.length > 1) {
        player.skipToNext();
      }
    }
    onClose();
  };

  const hasArtist = !!track && (!!track.artistId || !!track.artist.trim());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close menu"
        />
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.surfaceElevated,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
            },
          ]}
        >
          {mode === 'menu' ? (
            <>
              {/* Header */}
              <View style={[styles.trackHeader, { borderBottomColor: theme.border }]}>
                {!!track && (
                  <Image
                    source={{ uri: track.localThumbnailPath || track.thumbnailUrl }}
                    style={[styles.trackThumb, { backgroundColor: theme.card }]}
                  />
                )}
                <View style={styles.playlistInfo}>
                  <Text
                    numberOfLines={1}
                    style={[typography.body, { color: theme.text, fontWeight: '600' }]}
                  >
                    {track?.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.caption1, { color: theme.textSecondary }]}
                  >
                    {track?.artist}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setMode('playlist')}
                accessibilityRole="button"
              >
                <ListPlus size={22} color={theme.text} />
                <Text style={[typography.body, { color: theme.text }]}>Add to playlist</Text>
              </TouchableOpacity>

              {hasArtist && (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={handleGoToArtist}
                  accessibilityRole="button"
                >
                  <User size={22} color={theme.text} />
                  <Text style={[typography.body, { color: theme.text }]}>Go to artist</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.optionRow}
                onPress={handleStartRadio}
                disabled={isLoadingRadio}
                accessibilityRole="button"
              >
                {isLoadingRadio ? (
                  <ActivityIndicator size="small" color={theme.primary} style={styles.spinner} />
                ) : (
                  <Radio size={22} color={theme.text} />
                )}
                <Text style={[typography.body, { color: theme.text }]}>Start radio</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={handleNotInterested}
                accessibilityRole="button"
              >
                {isNotInterested ? (
                  <Undo2 size={22} color={theme.text} />
                ) : (
                  <ThumbsDown size={22} color={theme.text} />
                )}
                <View style={styles.playlistInfo}>
                  <Text style={[typography.body, { color: theme.text }]}>
                    {isNotInterested ? 'Undo "Not interested"' : 'Not interested'}
                  </Text>
                  {!isNotInterested && (
                    <Text style={[typography.caption1, { color: theme.textSecondary }]}>
                      Stop recommending this song
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity
                  onPress={() => setMode('menu')}
                  style={styles.headerBack}
                  accessibilityRole="button"
                  accessibilityLabel="Back to song options"
                >
                  <ChevronLeft size={24} color={theme.textSecondary} />
                  <Text style={[typography.title3, { color: theme.text }]}>
                    Add to Playlist
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Create new playlist */}
              {showCreate ? (
                <View style={[styles.createForm, { borderBottomColor: theme.border }]}>
                  <TextInput
                    style={[
                      styles.createInput,
                      typography.body,
                      {
                        color: theme.text,
                        backgroundColor: theme.searchBar,
                        borderRadius: borderRadius.md,
                      },
                    ]}
                    placeholder="Playlist name..."
                    placeholderTextColor={theme.textTertiary}
                    value={newName}
                    onChangeText={setNewName}
                    onSubmitEditing={handleCreate}
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={handleCreate}
                    style={[
                      styles.createButton,
                      { backgroundColor: theme.primary, borderRadius: borderRadius.md },
                    ]}
                  >
                    <Text style={[typography.subheadline, { color: '#FFF', fontWeight: '600' }]}>
                      Create
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.createRow, { borderBottomColor: theme.border }]}
                  onPress={() => setShowCreate(true)}
                >
                  <View
                    style={[
                      styles.createIcon,
                      { backgroundColor: theme.primary + '20' },
                    ]}
                  >
                    <Plus size={20} color={theme.primary} />
                  </View>
                  <Text style={[typography.body, { color: theme.primary, fontWeight: '600' }]}>
                    New Playlist
                  </Text>
                </TouchableOpacity>
              )}

              {/* Playlist list */}
              <FlatList
                data={playlists}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistRow}
                    onPress={() => handleAddToPlaylist(item.id)}
                  >
                    <View
                      style={[
                        styles.playlistIcon,
                        { backgroundColor: theme.card },
                      ]}
                    >
                      <Music size={18} color={theme.textSecondary} />
                    </View>
                    <View style={styles.playlistInfo}>
                      <Text
                        numberOfLines={1}
                        style={[typography.body, { color: theme.text }]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[typography.caption1, { color: theme.textSecondary }]}
                      >
                        {item.tracks.length} songs
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={[typography.body, { color: theme.textTertiary }]}>
                      No playlists yet. Create one above!
                    </Text>
                  </View>
                }
                style={{ maxHeight: 300 }}
                keyboardShouldPersistTaps="handled"
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    flex: 1,
  },
  container: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackThumb: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    minHeight: 52,
  },
  spinner: {
    width: 22,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createForm: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  createInput: {
    flex: 1,
    padding: spacing.md,
  },
  createButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  playlistIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
    gap: 2,
  },
  empty: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
});
