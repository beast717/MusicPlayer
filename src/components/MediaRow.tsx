import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Music } from 'lucide-react-native';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface MediaRowProps {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  /** Circular artwork, used for artists. */
  round?: boolean;
}

const IMAGE_SIZE = 56;

/** A list row that opens something (an artist, album or playlist) rather than playing it. */
const MediaRowInner = ({ imageUrl, title, subtitle, onPress, round }: MediaRowProps) => {
  const { theme } = useTheme();
  const radius = round ? IMAGE_SIZE / 2 : borderRadius.sm;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      <View
        style={[
          styles.imageContainer,
          { borderRadius: radius, backgroundColor: theme.card },
        ]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <Music size={22} color={theme.textTertiary} />
        )}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} style={[typography.subheadline, { color: theme.text }]}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            numberOfLines={1}
            style={[typography.caption1, { color: theme.textSecondary }]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={theme.textTertiary} />
    </TouchableOpacity>
  );
};

export const MediaRow = React.memo(MediaRowInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  imageContainer: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
