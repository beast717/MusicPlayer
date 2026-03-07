import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Volume2,
  Wifi,
  HardDrive,
  Trash2,
  Info,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useSettingsStore, useLibraryStore } from '../stores';
import { clearAllDownloads, getTotalDownloadsSize } from '../services/downloadManager';
import { AudioQuality } from '../utils/constants';

export function SettingsScreen() {
  const { theme, isDark } = useTheme();
  const audioQuality = useSettingsStore((s) => s.audioQuality);
  const setAudioQuality = useSettingsStore((s) => s.setAudioQuality);
  const downloadOverWifiOnly = useSettingsStore((s) => s.downloadOverWifiOnly);
  const setDownloadOverWifiOnly = useSettingsStore((s) => s.setDownloadOverWifiOnly);
  const autoPlay = useSettingsStore((s) => s.autoPlay);
  const setAutoPlay = useSettingsStore((s) => s.setAutoPlay);
  const downloadedTracks = useLibraryStore((s) => s.downloadedTracks);
  const removeDownloadedTrack = useLibraryStore((s) => s.removeDownloadedTrack);

  const [totalSize, setTotalSize] = useState(0);

  useEffect(() => {
    getTotalDownloadsSize().then(setTotalSize);
  }, [downloadedTracks.length]);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleAudioQuality = () => {
    const options: { label: string; value: AudioQuality }[] = [
      { label: 'Low (64 kbps) — saves data', value: 'low' },
      { label: 'Medium (128 kbps)', value: 'medium' },
      { label: 'High (256 kbps) — best quality', value: 'high' },
    ];

    Alert.alert(
      'Audio Quality',
      'Choose streaming quality',
      [
        ...options.map((opt) => ({
          text: `${opt.label}${audioQuality === opt.value ? ' ✓' : ''}`,
          onPress: () => setAudioQuality(opt.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleClearDownloads = () => {
    if (downloadedTracks.length === 0) {
      Alert.alert('No Downloads', 'There are no downloaded songs to clear.');
      return;
    }

    Alert.alert(
      'Clear All Downloads',
      `This will delete ${downloadedTracks.length} songs and free up ${formatSize(totalSize)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await clearAllDownloads();
            downloadedTracks.forEach((t) => removeDownloadedTrack(t.id));
            setTotalSize(0);
          },
        },
      ]
    );
  };

  const qualityLabel: Record<AudioQuality, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_HEIGHT + 20 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[typography.largeTitle, { color: theme.text }]}>
            Settings
          </Text>
        </View>

        {/* Audio Section */}
        <Text
          style={[
            typography.footnote,
            {
              color: theme.textSecondary,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xl,
              paddingBottom: spacing.sm,
              textTransform: 'uppercase',
              letterSpacing: 1,
            },
          ]}
        >
          Audio
        </Text>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={handleAudioQuality}
          >
            <Volume2 size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Streaming Quality
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {qualityLabel[audioQuality]}
            </Text>
            <ChevronRight size={16} color={theme.textTertiary} />
          </TouchableOpacity>

          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Wifi size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Download over Wi-Fi only
            </Text>
            <Switch
              value={downloadOverWifiOnly}
              onValueChange={setDownloadOverWifiOnly}
              trackColor={{ false: theme.border, true: theme.primary + '60' }}
              thumbColor={downloadOverWifiOnly ? theme.primary : theme.textTertiary}
            />
          </View>
        </View>

        {/* Storage Section */}
        <Text
          style={[
            typography.footnote,
            {
              color: theme.textSecondary,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xl,
              paddingBottom: spacing.sm,
              textTransform: 'uppercase',
              letterSpacing: 1,
            },
          ]}
        >
          Storage
        </Text>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <HardDrive size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Downloaded Songs
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {downloadedTracks.length} ({formatSize(totalSize)})
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={handleClearDownloads}
          >
            <Trash2 size={20} color={theme.danger} />
            <Text style={[typography.body, { color: theme.danger, flex: 1 }]}>
              Clear All Downloads
            </Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <Text
          style={[
            typography.footnote,
            {
              color: theme.textSecondary,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xl,
              paddingBottom: spacing.sm,
              textTransform: 'uppercase',
              letterSpacing: 1,
            },
          ]}
        >
          About
        </Text>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Info size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Version
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              1.0.0
            </Text>
          </View>

          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: isDark ? '#FFF' : '#000',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: isDark ? '#000' : '#FFF',
                  fontSize: 10,
                  fontWeight: '700',
                }}
              >
                ♪
              </Text>
            </View>
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Theme
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {isDark ? 'Dark' : 'Light'} (System)
            </Text>
          </View>
        </View>

        <Text
          style={[
            typography.caption1,
            {
              color: theme.textTertiary,
              textAlign: 'center',
              paddingTop: spacing.xxl,
              paddingHorizontal: spacing.xxl,
            },
          ]}
        >
          MusicPlayer — Personal YouTube music player.{'\n'}
          Audio streams provided by Piped & Invidious APIs.
        </Text>
      </ScrollView>
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
  section: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
