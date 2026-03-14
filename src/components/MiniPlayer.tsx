import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import {
  Play,
  Pause,
  SkipForward,
  ChevronUp,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { usePlayerStore } from '../stores/playerStore';
import { useProgress } from 'react-native-track-player';

interface MiniPlayerProps {
  onPress: () => void;
}

export function MiniPlayer({ onPress }: MiniPlayerProps) {
  const { theme } = useTheme();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const skipToNext = usePlayerStore((s) => s.skipToNext);

  const progress = useProgress(1000);

  const progressPercent =
    progress.duration > 0 ? progress.position / progress.duration : 0;

  if (!currentTrack) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: theme.miniPlayerBg,
          borderTopColor: theme.border,
        },
      ]}
    >
      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: theme.primary,
              width: `${progressPercent * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.content}>
        <Image
          source={{
            uri: currentTrack.localThumbnailPath || currentTrack.thumbnailUrl,
          }}
          style={[styles.artwork, { borderRadius: borderRadius.sm, backgroundColor: theme.card }]}
        />

        <View style={styles.info}>
          <Text
            numberOfLines={1}
            style={[typography.subheadline, { color: theme.text, fontWeight: '600' }]}
          >
            {currentTrack.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[typography.caption1, { color: theme.textSecondary }]}
          >
            {currentTrack.artist}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={togglePlayPause}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.controlButton}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={22} color={theme.text} fill={theme.text} />
            ) : (
              <Play size={22} color={theme.text} fill={theme.text} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={skipToNext}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.controlButton}
            accessibilityRole="button"
            accessibilityLabel="Skip to next track"
          >
            <SkipForward size={20} color={theme.text} fill={theme.text} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: MINI_PLAYER_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progressBar: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  artwork: {
    width: 44,
    height: 44,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlButton: {
    padding: spacing.xs,
  },
});
