import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  ListMusic,
  Share2,
  Download,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { usePlayerStore, useLibraryStore, useDownloadStore } from '../stores';
import { useProgress } from 'react-native-track-player';
import { formatDuration } from '../utils/helpers';

interface PlayerScreenProps {
  onDismiss: () => void;
}

export function PlayerScreen({ onDismiss }: PlayerScreenProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ARTWORK_SIZE = SCREEN_WIDTH - spacing.xxl * 2;
  const { theme, isDark } = useTheme();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const shuffleMode = usePlayerStore((s) => s.shuffleMode);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const skipToNext = usePlayerStore((s) => s.skipToNext);
  const skipToPrevious = usePlayerStore((s) => s.skipToPrevious);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore((s) => s.cycleRepeatMode);

  const isFavorite = useLibraryStore((s) =>
    currentTrack ? s.isFavorite(currentTrack.id) : false
  );
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const startDownload = useDownloadStore((s) => s.startDownload);
  const isDownloaded = useLibraryStore((s) =>
    currentTrack ? s.isDownloaded(currentTrack.id) : false
  );
  const downloadStatus = useDownloadStore((s) => 
    currentTrack ? s.getDownloadStatus(currentTrack.id) : null
  );
  const isDownloading = downloadStatus === 'downloading';

  const progress = useProgress(500);

  const handleSeek = useCallback(
    (value: number) => {
      seekTo(value);
    },
    [seekTo]
  );

  if (!currentTrack) return null;

  const RepeatIcon = repeatMode === 'track' ? Repeat1 : Repeat;
  const repeatActive = repeatMode !== 'off';
  const shuffleActive = shuffleMode === 'on';

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Close player">
          <ChevronDown size={28} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[typography.caption1, { color: theme.textSecondary }]}>
            PLAYING FROM
          </Text>
          <Text
            numberOfLines={1}
            style={[
              typography.footnote,
              { color: theme.text, fontWeight: '600' },
            ]}
          >
            Now Playing
          </Text>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="View playlist">
          <ListMusic size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Artwork */}
      <View style={styles.artworkContainer}>
        <Image
          source={{
            uri:
              currentTrack.localThumbnailPath || currentTrack.thumbnailUrl,
          }}
          style={[
            styles.artwork,
            {
              width: ARTWORK_SIZE,
              height: ARTWORK_SIZE,
              borderRadius: borderRadius.xl,
              backgroundColor: theme.card,
            },
          ]}
        />
      </View>

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <View style={styles.trackTitleRow}>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[
                typography.title2,
                { color: theme.text },
              ]}
            >
              {currentTrack.title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                typography.body,
                { color: theme.textSecondary, marginTop: 2 },
              ]}
            >
              {currentTrack.artist}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => toggleFavorite(currentTrack)}
            style={styles.favoriteButton}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={24}
              color={isFavorite ? theme.accent : theme.textTertiary}
              fill={isFavorite ? theme.accent : 'none'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <Slider
          style={styles.slider}
          value={progress.position}
          minimumValue={0}
          maximumValue={progress.duration || 1}
          onSlidingComplete={handleSeek}
          minimumTrackTintColor={theme.primary}
          maximumTrackTintColor={theme.border}
          thumbTintColor={theme.primary}
        />
        <View style={styles.timeRow}>
          <Text style={[typography.caption2, { color: theme.textSecondary }]}>
            {formatDuration(progress.position)}
          </Text>
          <Text style={[typography.caption2, { color: theme.textSecondary }]}>
            -{formatDuration(Math.max(0, (progress.duration || 0) - progress.position))}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleShuffle} style={styles.sideControl} accessibilityRole="button" accessibilityLabel={shuffleActive ? 'Disable shuffle' : 'Enable shuffle'}>
          <Shuffle
            size={22}
            color={shuffleActive ? theme.primary : theme.textTertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToPrevious} style={styles.skipButton} accessibilityRole="button" accessibilityLabel="Previous track">
          <SkipBack size={28} color={theme.text} fill={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlayPause}
          style={[styles.playButton, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={30} color="#FFF" fill="#FFF" />
          ) : (
            <Play size={30} color="#FFF" fill="#FFF" style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToNext} style={styles.skipButton} accessibilityRole="button" accessibilityLabel="Next track">
          <SkipForward size={28} color={theme.text} fill={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={cycleRepeatMode} style={styles.sideControl} accessibilityRole="button" accessibilityLabel={`Repeat mode: ${repeatMode}`}>
          <RepeatIcon
            size={22}
            color={repeatActive ? theme.primary : theme.textTertiary}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          onPress={() => {
            if (currentTrack && !isDownloaded && !isDownloading) {
              startDownload(currentTrack);
            }
          }}
          style={styles.bottomAction}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Download
              size={20}
              color={isDownloaded ? theme.success : theme.textTertiary}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomAction}>
          <Share2 size={20} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
    width: 44,
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  artworkContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    flex: 1,
    justifyContent: 'center',
  },
  artwork: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  trackInfo: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  favoriteButton: {
    padding: spacing.xs,
    marginTop: 4,
  },
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xl,
  },
  sideControl: {
    padding: spacing.sm,
  },
  skipButton: {
    padding: spacing.sm,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxxl,
    paddingBottom: spacing.lg,
  },
  bottomAction: {
    padding: spacing.sm,
  },
});
