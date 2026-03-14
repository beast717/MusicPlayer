
import TrackPlayer, {
  Event,
  RepeatMode,
  Capability,
  AppKilledPlaybackBehavior,
  State,
} from 'react-native-track-player';
import { usePlayerStore, getSwitchingTrackId } from '../stores/playerStore';
import { getAudioPlaybackSource, invalidateStreamCache } from './youtube';
import {
  buildTrackPlayerSource,
  getActiveTrackDebug,
} from './trackPlayerHelpers';

/** Track IDs that have already been retried once to avoid infinite retry loops. */
const retriedTrackIds = new Set<string>();

/** Flag to silence spurious active-track events while swapping placeholders. */
let _isSwappingTrack = false;

/** TrackPlayer setup state flag */
let isPlayerSetup = false;

// This service is registered with TrackPlayer and handles remote events
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) =>
    TrackPlayer.seekTo(event.position)
  );
  TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
    const position = (await TrackPlayer.getProgress()).position;
    await TrackPlayer.seekTo(position + event.interval);
  });
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
    const position = (await TrackPlayer.getProgress()).position;
    await TrackPlayer.seekTo(Math.max(0, position - event.interval));
  });

  // Handle playback errors with automatic retry.
  // When YouTube's CDN rejects a stream URL (e.g. 403 due to missing PoToken),
  // we invalidate the cached URL, re-resolve the stream, and retry once.
  TrackPlayer.addEventListener(Event.PlaybackError, async (event: any) => {
    const store = usePlayerStore.getState();
    const msg = event.message || event.error || 'Unknown playback error';
    let debug = '';
    let activeTrackId: string | undefined;

    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      debug = getActiveTrackDebug(activeTrack);
      activeTrackId = activeTrack?.id as string | undefined;
    } catch {}

    console.warn('PlaybackError:', event.code, msg, debug);

    // Attempt automatic retry once per track
    if (activeTrackId && !retriedTrackIds.has(activeTrackId)) {
      retriedTrackIds.add(activeTrackId);
      console.log(`Retrying playback for ${activeTrackId} with fresh stream URL...`);

      try {
        // Bust the cached (broken) URL so resolveAudioSource fetches fresh
        invalidateStreamCache(activeTrackId);

        const freshSource = buildTrackPlayerSource(
          await getAudioPlaybackSource(activeTrackId)
        );
        const currentTrack = store.currentTrack;
        const activeIndex = await TrackPlayer.getActiveTrackIndex();

        if (activeIndex != null) {
          _isSwappingTrack = true;
          try {
            await TrackPlayer.remove(activeIndex);
            await TrackPlayer.add(
              {
                id: activeTrackId,
                ...freshSource,
                title: currentTrack?.title ?? '',
                artist: currentTrack?.artist ?? '',
                artwork: currentTrack?.localThumbnailPath || currentTrack?.thumbnailUrl || '',
                duration: currentTrack?.duration ?? 0,
              },
              activeIndex
            );
            await TrackPlayer.skip(activeIndex);
            await TrackPlayer.play();
            store.setIsPlaying(true);
            store.setError(null);
            if (currentTrack) store.setCurrentTrack(currentTrack);
          } finally {
            setTimeout(() => {
              _isSwappingTrack = false;
            }, 100);
          }
          return; // Retry succeeded – don't show an error
        }
      } catch (retryErr: any) {
        console.warn('Retry failed:', retryErr.message);
        // Fall through to show the original error
      }
    }

    store.setError(
      debug ? `Playback failed: ${msg}\n${debug}` : `Playback failed: ${msg}`
    );
    store.setIsPlaying(false);
  });

  // Sync UI isPlaying state with actual playback state (phone call, audio focus, etc.)
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    const store = usePlayerStore.getState();
    const isPlaying =
      event.state === State.Playing || event.state === State.Buffering;
    const isStopped =
      event.state === State.Paused ||
      event.state === State.Stopped ||
      event.state === State.None;
    if (isPlaying && !store.isPlaying) {
      store.setIsPlaying(true);
    } else if (isStopped && store.isPlaying) {
      store.setIsPlaying(false);

    }
  });

  // Resolve stream URLs just-in-time when the active track changes
  TrackPlayer.addEventListener(
    Event.PlaybackActiveTrackChanged,
    async (event) => {
      const { index: nextIndex } = event;

      if (nextIndex == null) return;

      // Ignore intermediate events while we are replacing a track placeholder
      if (_isSwappingTrack) return;

      // If playTrack/playQueue is actively switching, it will set
      // currentTrack itself — don't fight with it.
      if (getSwitchingTrackId() != null) return;

      const store = usePlayerStore.getState();

      // Update current track in store
      const storeQueue = store.queue;
      if (nextIndex >= storeQueue.length) return;

      const nextTrack = storeQueue[nextIndex];
      store.setCurrentTrack(nextTrack);
      if (nextTrack) retriedTrackIds.delete(nextTrack.id);

      // If the track URL is a placeholder, resolve it now
      const tpQueue = await TrackPlayer.getQueue();
      const activeTP = tpQueue[nextIndex];
      if (
        activeTP &&
        (activeTP.url === 'https://placeholder.invalid' || activeTP.url === '')
      ) {
        if (!nextTrack.localFilePath) {
          try {
            const source = buildTrackPlayerSource(
              await getAudioPlaybackSource(nextTrack.id)
            );

            // VERIFY that the user is still on the same track
            const currentIndexNow = await TrackPlayer.getActiveTrackIndex();
            if (currentIndexNow !== nextIndex) {
              // User skipped away – abort replacement
              return;
            }

            _isSwappingTrack = true;
            try {
              await TrackPlayer.remove(nextIndex);
              await TrackPlayer.add(
                {
                  id: nextTrack.id,
                  ...source,
                  title: nextTrack.title,
                  artist: nextTrack.artist,
                  artwork: nextTrack.localThumbnailPath || nextTrack.thumbnailUrl,
                  duration: nextTrack.duration,
                },
                nextIndex
              );
              await TrackPlayer.skip(nextIndex);
              await TrackPlayer.play();
              store.setCurrentTrack(nextTrack);
            } finally {
              setTimeout(() => { _isSwappingTrack = false; }, 100);
            }
          } catch (err) {
            store.setError(err instanceof Error ? err.message : 'Failed to resolve stream');
          }
        }
      }
    }
  );
}

export async function setupTrackPlayer(): Promise<void> {
  if (isPlayerSetup) return;

  try {
    await TrackPlayer.setupPlayer({
      maxCacheSize: 1024 * 50, // 50MB cache
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      progressUpdateEventInterval: 1,
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    isPlayerSetup = true;
  } catch (error) {
    console.error('Error setting up TrackPlayer:', error);
  }
}
