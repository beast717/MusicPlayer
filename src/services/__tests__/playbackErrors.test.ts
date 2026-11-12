import { describePlaybackError } from '../playbackErrors';

describe('describePlaybackError', () => {
  it.each([
    ['Network request failed', 'offline'],
    ['Playback failed: The Internet connection appears to be offline.\nstreamType=default', 'offline'],
    [
      "Could not get audio stream.\nWebView (attempt 1): TV_SIMPLY: LOGIN_REQUIRED Sign in to confirm you're not a bot\nInnerTube: IOS: HTTP 403",
      'blocked',
    ],
    ['Could not get audio stream.\nWebView (attempt 2): stream blocked (HTTP 403)', 'blocked'],
    ['Could not get audio stream.\nWebView (attempt 1): BotGuard attestation was rejected', 'blocked'],
    [
      'Could not get audio stream.\nWebView (attempt 1): TV_SIMPLY: LOGIN_REQUIRED Sign in to confirm your age',
      'age-restricted',
    ],
    [
      'Could not get audio stream.\nWebView (attempt 1): TV_SIMPLY: UNPLAYABLE The uploader has not made this video available in your country',
      'region',
    ],
    ['Could not get audio stream.\nWebView (attempt 1): TV_SIMPLY: ERROR This video is unavailable', 'unavailable'],
    ['Could not get audio stream.\nInnerTube: IOS: LOGIN_REQUIRED This is a private video', 'unavailable'],
    ['Could not get audio stream.\nWebView (attempt 1): WebView timed out after 30s', 'timeout'],
    ['Aborted', 'timeout'],
    ['Could not get audio stream.\nWebView (attempt 1): no suitable audio stream found', 'no-audio'],
    ['Playback failed: The operation couldn’t be completed.', 'unknown'],
  ])('%j → %s', (raw, kind) => {
    expect(describePlaybackError(raw).kind).toBe(kind);
  });

  it('blames the connection whenever the device is offline', () => {
    const info = describePlaybackError('Could not get audio stream.\nWebView timed out after 30s', false);

    expect(info.kind).toBe('offline');
    expect(info.title).toBe('No Internet Connection');
  });

  it('keeps the original text as details and never shows it as the message', () => {
    const raw = '  Could not get audio stream.\nInnerTube: IOS: HTTP 429  ';
    const info = describePlaybackError(raw, true);

    expect(info.details).toBe(raw.trim());
    expect(info.message).not.toContain('InnerTube');
    expect(info.title).toBe('YouTube Blocked the Request');
  });
});
