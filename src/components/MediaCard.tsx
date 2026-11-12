import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Music } from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface MediaCardProps {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
  size?: number;
  /** Highlight the title (e.g. the track that is playing). */
  active?: boolean;
  /** Circular artwork with centred text, used for artists. */
  round?: boolean;
}

/** Square artwork with a title and subtitle, for horizontal rows of tracks, albums or mixes. */
const MediaCardInner = ({
  imageUrl,
  title,
  subtitle,
  onPress,
  onLongPress,
  size = 140,
  active,
  round,
}: MediaCardProps) => {
  const { theme } = useTheme();
  const textAlign = round ? 'center' : 'left';

  return (
    <TouchableOpacity
      style={[styles.container, { width: size }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      <View
        style={[
          styles.imageContainer,
          { width: size, height: size, backgroundColor: theme.card },
          round && { borderRadius: size / 2 },
        ]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} />
        ) : (
          <Music size={32} color={theme.textTertiary} />
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[
          typography.caption1,
          {
            color: active ? theme.primary : theme.text,
            fontWeight: active ? '600' : '500',
            marginTop: spacing.sm,
            textAlign,
          },
        ]}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text
          numberOfLines={1}
          style={[typography.caption2, { color: theme.textSecondary, textAlign }]}
        >
          {subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const MediaCard = React.memo(MediaCardInner);

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  imageContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
