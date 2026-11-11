import { createListenTracker } from '../listenTracker';
import { Track } from '../../types';

const track = (id: string, duration = 200): Track => ({
  id,
  title: id,
  artist: 'A',
  duration,
  thumbnailUrl: '',
});

function setup() {
  const onPlay = jest.fn();
  const onSkip = jest.fn();
  const tracker = createListenTracker({ onPlay, onSkip });
  /** Simulate one progress event per second from `from` to `to`. */
  const listen = (t: Track, from: number, to: number) => {
    for (let position = from; position <= to; position++) tracker.onProgress(t, position);
  };
  return { tracker, onPlay, onSkip, listen };
}

it('counts a play once after 30 seconds of listening', () => {
  const { onPlay, onSkip, listen } = setup();
  const a = track('a');

  listen(a, 0, 29);
  expect(onPlay).not.toHaveBeenCalled();

  listen(a, 30, 120);
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(onPlay).toHaveBeenCalledWith(a);
  expect(onSkip).not.toHaveBeenCalled();
});

it('counts short tracks once half of them has been heard', () => {
  const { onPlay, listen } = setup();

  listen(track('short', 20), 0, 10);

  expect(onPlay).toHaveBeenCalledTimes(1);
});

it('records a skip when a track is abandoned early', () => {
  const { onPlay, onSkip, listen } = setup();
  const a = track('a');

  listen(a, 0, 8);
  listen(track('b'), 0, 2);

  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(onSkip).toHaveBeenCalledWith(a);
  expect(onPlay).not.toHaveBeenCalled();
});

it('does not record a skip for a played track or one that never started', () => {
  const { onSkip, listen, tracker } = setup();

  listen(track('a'), 0, 40); // played
  tracker.onProgress(track('b'), 0); // became active but no audio was heard
  listen(track('c'), 0, 3);

  expect(onSkip).not.toHaveBeenCalled();
});

it('ignores seeking: jumping ahead is not listening', () => {
  const { onPlay, listen, tracker } = setup();
  const a = track('a');

  listen(a, 0, 5);
  tracker.onProgress(a, 150); // seek
  listen(a, 151, 160);

  expect(onPlay).not.toHaveBeenCalled(); // only ~14s actually heard
});

it('does not count paused time', () => {
  const { onPlay, tracker } = setup();
  const a = track('a');

  for (let i = 0; i < 100; i++) tracker.onProgress(a, 12); // paused at 0:12

  expect(onPlay).not.toHaveBeenCalled();
});

it('counts a repeated track again when it restarts', () => {
  const { onPlay, listen } = setup();
  const a = track('a', 60);

  listen(a, 0, 60);
  listen(a, 0, 60);

  expect(onPlay).toHaveBeenCalledTimes(2);
});
