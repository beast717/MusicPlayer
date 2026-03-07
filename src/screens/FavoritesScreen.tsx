import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Heart, Shuffle, Play } from 'lucide-react-native';
import { TrackItem } from '../components';
import { useTheme } from '../theme';
import { typography } from '../theme/typography';
import { spacing, borderRadius, MINI_PLAYER_HEIGHT } from '../theme/spacing';
import { useLibraryStore, usePlayerStore } from '../stores';
import { useNavigation } from '@react-navigation/native';
import { shuffleArray } from '../utils/helpers';

export function FavoritesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const favorites = useLibraryStore((s) => s.favorites);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);

  const handlePlayAll = () => {
    if (favorites.length > 0) {
      playQueue(favorites);
    }
  };

  const handleShuffleAll = () => {
    if (favorites.length > 0) {
      const shuffled = shuffleArray(favorites);
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
      </View>

      <View style={styles.titleSection}>
        <View style={[styles.iconContainer, { backgroundColor: theme.accent + '20' }]}>
          <Heart size={32} color={theme.accent} fill={theme.accent} />
        </View>
        <Text style={[typography.title1, { color: theme.text, marginTop: spacing.md }]}>
          Liked Songs
        </Text>
        <Text style={[typography.footnote, { color: theme.textSecondary }]}>
          {favorites.length} {favorites.length === 1 ? 'song' : 'songs'}
        </Text>

        {favorites.length > 0 && (
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
        data={favorites}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackItem
            track={item}
            index={index}
            showIndex
            onPress={() => playQueue(favorites, index)}
            isPlaying={currentTrack?.id === item.id}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Heart size={48} color={theme.textTertiary} />
            <Text style={[typography.body, { color: theme.textTertiary, marginTop: spacing.md }]}>
              No liked songs yet
            </Text>
            <Text style={[typography.footnote, { color: theme.textTertiary, textAlign: 'center' }]}>
              Tap the heart icon on any song to add it here
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
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
