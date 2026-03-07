import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Heart, MoreVertical, Download, Play } from 'lucide-react-native';
import { Track, SearchResult } from '../types';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';
import { formatDuration } from '../utils/helpers';
import { useLibraryStore } from '../stores/libraryStore';
import { useDownloadStore } from '../stores/downloadStore';

interface TrackItemProps {
  track: Track | SearchResult;
  index?: number;
  showIndex?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onMorePress?: () => void;
  isPlaying?: boolean;
  isLoading?: boolean;
  compact?: boolean;
}

function isSearchResult(item: Track | SearchResult): item is SearchResult {
  return 'videoId' in item;
}

function toTrack(item: Track | SearchResult): Track {
  if (isSearchResult(item)) {
    return {
      id: item.videoId,
      title: item.title,
      artist: item.uploaderName,
      duration: item.duration,
      thumbnailUrl: item.thumbnailUrl,
    };
  }
  return item;
}

export function TrackItem({
  track: item,
  index,
  showIndex,
  onPress,
  onLongPress,
  onMorePress,
  isPlaying,
  isLoading,
  compact,
}: TrackItemProps) {
  const { theme } = useTheme();
  const track = toTrack(item);
  const isFavorite = useLibraryStore((s) => s.isFavorite(track.id));
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const isDownloaded = useLibraryStore((s) => s.isDownloaded(track.id));
  const downloadProgress = useDownloadStore((s) => s.getDownloadProgress(track.id));
  const downloadStatus = useDownloadStore((s) => s.getDownloadStatus(track.id));

  const imageSize = compact ? 44 : 52;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isPlaying
            ? theme.primary + '15'
            : 'transparent',
          paddingVertical: compact ? spacing.sm : spacing.md,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
    >
      {showIndex && index !== undefined && (
        <Text
          style={[
            styles.index,
            { color: isPlaying ? theme.primary : theme.textSecondary },
          ]}
        >
          {index + 1}
        </Text>
      )}

      <View style={[styles.thumbnail, { width: imageSize, height: imageSize }]}>
        <Image
          source={{ uri: track.localThumbnailPath || track.thumbnailUrl }}
          style={[
            styles.thumbnailImage,
            { width: imageSize, height: imageSize, borderRadius: borderRadius.sm },
          ]}
        />
        {isPlaying && (
          <View
            style={[
              styles.playingOverlay,
              { borderRadius: borderRadius.sm },
            ]}
          >
            <Play size={16} color="#FFF" fill="#FFF" />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[
            typography.subheadline,
            {
              color: isPlaying ? theme.primary : theme.text,
              fontWeight: isPlaying ? '600' : '400',
            },
          ]}
        >
          {track.title}
        </Text>
        <View style={styles.subtitleRow}>
          {isDownloaded && (
            <Download
              size={11}
              color={theme.success}
              style={{ marginRight: 4 }}
            />
          )}
          <Text
            numberOfLines={1}
            style={[typography.caption1, { color: theme.textSecondary, flex: 1 }]}
          >
            {track.artist}
          </Text>
          {track.duration > 0 && (
            <Text style={[typography.caption1, { color: theme.textTertiary }]}>
              {formatDuration(track.duration)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <>
            <TouchableOpacity
              onPress={() => toggleFavorite(track)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.actionButton}
            >
              <Heart
                size={18}
                color={isFavorite ? theme.accent : theme.textTertiary}
                fill={isFavorite ? theme.accent : 'none'}
              />
            </TouchableOpacity>

            {onMorePress && (
              <TouchableOpacity
                onPress={onMorePress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.actionButton}
              >
                <MoreVertical size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export { toTrack, isSearchResult };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  index: {
    width: 24,
    ...typography.footnote,
    textAlign: 'center',
  },
  thumbnail: {
    position: 'relative',
  },
  thumbnailImage: {
    backgroundColor: '#333',
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.xs,
  },
});
