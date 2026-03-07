import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Download,
  Check,
  ArrowDownCircle,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { spacing } from '../theme/spacing';
import { useDownloadStore, DownloadStatus } from '../stores/downloadStore';
import { useLibraryStore } from '../stores/libraryStore';
import { Track } from '../types';

interface DownloadButtonProps {
  track: Track;
  size?: number;
}

export function DownloadButton({ track, size = 20 }: DownloadButtonProps) {
  const { theme } = useTheme();
  const startDownload = useDownloadStore((s) => s.startDownload);
  const downloadStatus = useDownloadStore((s) => s.getDownloadStatus(track.id));
  const downloadProgress = useDownloadStore((s) => s.getDownloadProgress(track.id));
  const isDownloaded = useLibraryStore((s) => s.isDownloaded(track.id));

  const status: DownloadStatus | 'available' = isDownloaded
    ? 'completed'
    : downloadStatus || 'available';

  const handlePress = () => {
    if (status === 'available' || status === 'failed') {
      startDownload(track);
    }
  };

  if (status === 'completed') {
    return (
      <View style={styles.container}>
        <Check size={size} color={theme.success} />
      </View>
    );
  }

  if (status === 'downloading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <ArrowDownCircle
        size={size}
        color={status === 'failed' ? theme.danger : theme.textTertiary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
