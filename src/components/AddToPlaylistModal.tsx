import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Plus, X, Music } from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { useLibraryStore } from '../stores/libraryStore';
import { Track } from '../types';

interface AddToPlaylistModalProps {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
}

export function AddToPlaylistModal({
  visible,
  track,
  onClose,
}: AddToPlaylistModalProps) {
  const { theme } = useTheme();
  const playlists = useLibraryStore((s) => s.playlists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');

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
          {/* Header */}
          <View style={styles.header}>
            <Text style={[typography.title3, { color: theme.text }]}>
              Add to Playlist
            </Text>
            <TouchableOpacity onPress={onClose}>
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
          />
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
