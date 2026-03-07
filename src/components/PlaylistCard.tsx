import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Play } from 'lucide-react-native';
import { Playlist } from '../types';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: () => void;
  onLongPress?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function PlaylistCard({
  playlist,
  onPress,
  onLongPress,
  size = 'medium',
}: PlaylistCardProps) {
  const { theme } = useTheme();

  const cardSize = size === 'small' ? 130 : size === 'large' ? 200 : 160;
  const imageSize = cardSize;

  const coverUrl =
    playlist.coverUrl ||
    playlist.tracks[0]?.thumbnailUrl;

  return (
    <TouchableOpacity
      style={[styles.container, { width: cardSize }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.imageContainer,
          {
            width: imageSize,
            height: imageSize,
            backgroundColor: theme.card,
            borderRadius: borderRadius.lg,
          },
        ]}
      >
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={[
              styles.image,
              {
                width: imageSize,
                height: imageSize,
                borderRadius: borderRadius.lg,
              },
            ]}
          />
        ) : (
          <View style={styles.placeholderIcon}>
            <Play size={32} color={theme.textTertiary} />
          </View>
        )}
      </View>

      <Text
        numberOfLines={1}
        style={[
          typography.footnote,
          { color: theme.text, fontWeight: '600', marginTop: spacing.sm },
        ]}
      >
        {playlist.name}
      </Text>
      <Text
        numberOfLines={1}
        style={[typography.caption2, { color: theme.textSecondary }]}
      >
        {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  imageContainer: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  placeholderIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
