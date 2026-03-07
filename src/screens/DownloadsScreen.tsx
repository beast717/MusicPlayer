import React, { useState, useEffect } from 'react';
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
  Download,
  Trash2,
  HardDrive,
  Play,
  Shuffle,
} from 'lucide-react-native';
import { TrackItem } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useLibraryStore, usePlayerStore, useDownloadStore } from '../stores';
import { clearAllDownloads, getTotalDownloadsSize } from '../services/downloadManager';
import { useNavigation } from '@react-navigation/native';
import { formatSize, shuffleArray } from '../utils/helpers';

export function DownloadsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const downloadedTracks = useLibraryStore((s) => s.downloadedTracks);
  const removeDownloadedTrack = useLibraryStore((s) => s.removeDownloadedTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const removeDownload = useDownloadStore((s) => s.removeDownload);

  const [totalSize, setTotalSize] = useState(0);

  useEffect(() => {
    getTotalDownloadsSize().then(setTotalSize);
  }, [downloadedTracks.length]);

  const handleDeleteTrack = (trackId: string, title: string) => {
    Alert.alert(
      'Delete Download',
      `Delete "${title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeDownload(trackId),
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Downloads',
      `This will delete ${downloadedTracks.length} downloaded songs and free up ${formatSize(totalSize)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await clearAllDownloads();
            // Clear all from library store
            downloadedTracks.forEach((t) => removeDownloadedTrack(t.id));
          },
        },
      ]
    );
  };

  const handlePlayAll = () => {
    if (downloadedTracks.length > 0) {
      playQueue(downloadedTracks);
    }
  };

  const handleShuffleAll = () => {
    if (downloadedTracks.length > 0) {
      const shuffled = shuffleArray(downloadedTracks);
      playQueue(shuffled);
    }
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
        {downloadedTracks.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
            <Trash2 size={18} color={theme.danger} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleSection}>
        <View style={[styles.iconContainer, { backgroundColor: theme.success + '20' }]}>
          <Download size={32} color={theme.success} />
        </View>
        <Text style={[typography.title1, { color: theme.text, marginTop: spacing.md }]}>
          Downloads
        </Text>
        <View style={styles.statsRow}>
          <Text style={[typography.footnote, { color: theme.textSecondary }]}>
            {downloadedTracks.length} {downloadedTracks.length === 1 ? 'song' : 'songs'}
          </Text>
          <Text style={[typography.footnote, { color: theme.textTertiary }]}>•</Text>
          <HardDrive size={12} color={theme.textSecondary} />
          <Text style={[typography.footnote, { color: theme.textSecondary }]}>
            {formatSize(totalSize)}
          </Text>
        </View>

        {downloadedTracks.length > 0 && (
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
                { borderColor: theme.primary, borderWidth: 1.5 },
              ]}
            >
              <Shuffle size={18} color={theme.primary} />
              <Text style={[typography.subheadline, { color: theme.primary, fontWeight: '600' }]}>
                Shuffle
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={downloadedTracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => playQueue(downloadedTracks, index)}
            onLongPress={() => handleDeleteTrack(item.id, item.title)}
            isPlaying={currentTrack?.id === item.id}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Download size={48} color={theme.textTertiary} />
            <Text style={[typography.body, { color: theme.textTertiary, marginTop: spacing.md }]}>
              No downloads yet
            </Text>
            <Text style={[typography.footnote, { color: theme.textTertiary, textAlign: 'center' }]}>
              Download songs to listen offline
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
        showsVerticalScrollIndicator={false}
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
  clearButton: {
    padding: spacing.xs,
  },
  titleSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
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
