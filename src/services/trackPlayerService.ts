import TrackPlayer, {
  Event,
  RepeatMode,
  Capability,
  AppKilledPlaybackBehavior,
  State,
} from 'react-native-track-player';
import { usePlayerStore } from '../stores/playerStore';
import { getAudioStreamUrl } from './youtube';

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
      const store = usePlayerStore.getState();
      const { index: nextIndex } = event;

      if (nextIndex == null) return;

      // Update current track in store
      const storeQueue = store.queue;
      if (nextIndex < storeQueue.length) {
        store.setCurrentTrack(storeQueue[nextIndex]);
      }

      // If the track URL is a placeholder, resolve it now
      const tpQueue = await TrackPlayer.getQueue();
      const activeTP = tpQueue[nextIndex];
      if (
        activeTP &&
        (activeTP.url === 'https://placeholder.invalid' || activeTP.url === '')
      ) {
        const storeTrack = storeQueue[nextIndex];
        if (storeTrack && !storeTrack.localFilePath) {
          try {
            const url = await getAudioStreamUrl(storeTrack.id);
            // Replace the track with the resolved URL
            await TrackPlayer.remove(nextIndex);
            await TrackPlayer.add(
              {
                id: storeTrack.id,
                url,
                title: storeTrack.title,
                artist: storeTrack.artist,
                artwork:
                  storeTrack.localThumbnailPath || storeTrack.thumbnailUrl,
                duration: storeTrack.duration,
              },
              nextIndex
            );
            await TrackPlayer.skip(nextIndex);
            await TrackPlayer.play();
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : 'Failed to resolve stream';
            store.setError(message);
          }
        }
      }
    }
  );
}

let isPlayerSetup = false;

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
