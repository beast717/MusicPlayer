import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Volume2,
  Wifi,
  HardDrive,
  Smartphone,
  Heart,
  Trash2,
  Info,
  ChevronRight,
  Check,
  Palette,
  History,
  RefreshCw,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { PrimaryHue } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import {
  useSettingsStore,
  useLibraryStore,
  useHistoryStore,
  useHomeStore,
} from '../stores';
import { clearAllDownloads, getTotalDownloadsSize } from '../services/downloadManager';
import { AudioQuality, APP_VERSION } from '../utils/constants';
import { formatSize } from '../utils/helpers';

export function SettingsScreen() {
  const { theme, isDark } = useTheme();
  const audioQuality = useSettingsStore((s) => s.audioQuality);
  const setAudioQuality = useSettingsStore((s) => s.setAudioQuality);
  const downloadOverWifiOnly = useSettingsStore((s) => s.downloadOverWifiOnly);
  const setDownloadOverWifiOnly = useSettingsStore((s) => s.setDownloadOverWifiOnly);
  const autoDownloadFavorites = useSettingsStore((s) => s.autoDownloadFavorites);
  const setAutoDownloadFavorites = useSettingsStore((s) => s.setAutoDownloadFavorites);
  const favorites = useLibraryStore((s) => s.favorites);
  const primaryHue = useSettingsStore((s) => s.primaryHue);
  const setPrimaryHue = useSettingsStore((s) => s.setPrimaryHue);
  const downloadedTracks = useLibraryStore((s) => s.downloadedTracks);
  const removeDownloadedTrack = useLibraryStore((s) => s.removeDownloadedTrack);

  const historyCount = useHistoryStore((s) => Object.keys(s.stats).length);
  const clearHistory = useHistoryStore((s) => s.clearHistory);
  const refreshRecommendations = useHomeStore((s) => s.refresh);

  const [totalSize, setTotalSize] = useState(0);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);

  useEffect(() => {
    getTotalDownloadsSize().then(setTotalSize);
    FileSystem.getFreeDiskStorageAsync().then(setFreeSpace, () => setFreeSpace(null));
  }, [downloadedTracks.length]);

  const handleAutoDownload = (enabled: boolean) => {
    if (!enabled) {
      setAutoDownloadFavorites(false);
      return;
    }

    const missing = favorites.filter(
      (track) => !downloadedTracks.some((d) => d.id === track.id)
    ).length;
    if (missing === 0) {
      setAutoDownloadFavorites(true);
      return;
    }

    Alert.alert(
      'Download Liked Songs',
      `${missing} liked ${missing === 1 ? 'song is' : 'songs are'} not on this device yet and will be downloaded now${
        downloadOverWifiOnly ? ' (on Wi-Fi only)' : ''
      }. Songs you like from now on are downloaded automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => setAutoDownloadFavorites(true) },
      ]
    );
  };

  const handleAudioQuality = () => {
    const options: { label: string; value: AudioQuality }[] = [
      { label: 'Low — smallest files', value: 'low' },
      { label: 'Medium (~128 kbps)', value: 'medium' },
      { label: 'High — best available', value: 'high' },
    ];

    Alert.alert(
      'Download Quality',
      'Used for downloaded songs. Streaming adjusts quality automatically to your connection.',
      [
        ...options.map((opt) => ({
          text: `${opt.label}${audioQuality === opt.value ? ' ✓' : ''}`,
          onPress: () => setAudioQuality(opt.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handlePrimaryHue = () => {
    const options: { label: string; value: PrimaryHue }[] = [
      { label: 'Navy Blue (Default)', value: 'navy' },
      { label: 'Olive Green', value: 'olive' },
      { label: 'Purple', value: 'purple' },
      { label: 'Red', value: 'red' },
      { label: 'Turquoise', value: 'turquoise' },
    ];

    Alert.alert(
      'Primary Color',
      'Choose the app accent color',
      [
        ...options.map((opt) => ({
          text: `${opt.label}${primaryHue === opt.value ? ' ✓' : ''}`,
          onPress: () => setPrimaryHue(opt.value),
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

  const handleClearHistory = () => {
    if (historyCount === 0) {
      Alert.alert('No History', 'There is no listening history to clear.');
      return;
    }

    Alert.alert(
      'Clear Listening History',
      'Recommendations on the home screen are based on this history and will start over.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearHistory();
            refreshRecommendations();
          },
        },
      ]
    );
  };

  const handleCheckForUpdate = async () => {
    if (!Updates.isEnabled) {
      Alert.alert('Updates Unavailable', 'This build does not support over-the-air updates.');
      return;
    }

    setIsCheckingForUpdate(true);
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        Alert.alert('Up to Date', 'You already have the latest version.');
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert('Update Ready', 'Restart the app now to use the new version? Playback will stop.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ]);
    } catch (err) {
      Alert.alert(
        'Update Failed',
        err instanceof Error ? err.message : 'Could not check for updates.'
      );
    } finally {
      setIsCheckingForUpdate(false);
    }
  };

  const qualityLabel: Record<AudioQuality, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  const hueLabel: Record<PrimaryHue, string> = {
    navy: 'Navy Blue',
    olive: 'Olive Green',
    purple: 'Purple',
    red: 'Red',
    turquoise: 'Turquoise',
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
              Download Quality
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {qualityLabel[audioQuality]}
            </Text>
            <ChevronRight size={16} color={theme.textTertiary} />
          </TouchableOpacity>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
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

          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Heart size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Auto-download liked songs
            </Text>
            <Switch
              value={autoDownloadFavorites}
              onValueChange={handleAutoDownload}
              trackColor={{ false: theme.border, true: theme.primary + '60' }}
              thumbColor={autoDownloadFavorites ? theme.primary : theme.textTertiary}
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

          {freeSpace != null && (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <Smartphone size={20} color={theme.primary} />
              <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
                Free Space on Device
              </Text>
              <Text style={[typography.body, { color: theme.textSecondary }]}>
                {formatSize(freeSpace)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={handleClearDownloads}
          >
            <Trash2 size={20} color={theme.danger} />
            <Text style={[typography.body, { color: theme.danger, flex: 1 }]}>
              Clear All Downloads
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={handleClearHistory}
          >
            <History size={20} color={theme.danger} />
            <Text style={[typography.body, { color: theme.danger, flex: 1 }]}>
              Clear Listening History
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {historyCount} {historyCount === 1 ? 'song' : 'songs'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Appearance Section */}
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
          Appearance
        </Text>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: theme.text,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.background,
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

          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={handlePrimaryHue}
          >
            <Palette size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Primary Color
            </Text>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              {hueLabel[primaryHue]}
            </Text>
            <ChevronRight size={16} color={theme.textTertiary} />
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
              {APP_VERSION}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={handleCheckForUpdate}
            disabled={isCheckingForUpdate}
          >
            <RefreshCw size={20} color={theme.primary} />
            <Text style={[typography.body, { color: theme.text, flex: 1 }]}>
              Check for Updates
            </Text>
            {isCheckingForUpdate ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <ChevronRight size={16} color={theme.textTertiary} />
            )}
          </TouchableOpacity>
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
          Music is streamed directly from YouTube.
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
