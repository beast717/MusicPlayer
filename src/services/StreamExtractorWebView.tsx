import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

interface StreamResult {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
}

interface PendingRequest {
  videoId: string;
  resolve: (streams: StreamResult[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface DiagnosticState {
  phase: 'idle' | 'bootstrap' | 'embed';
  loadStarts: number;
  loadEnds: number;
  sawHook: boolean;
  lastEvent: string;
  lastUrl: string;
}

interface ActiveRequest {
  videoId: string;
  phase: 'bootstrap' | 'embed';
}

let pendingRequest: PendingRequest | null = null;
let requestVideoId: ((videoId: string) => void) | null = null;
let dismissWebView: (() => void) | null = null;
let getDiagnostics: (() => string) | null = null;

const EXTRACT_TIMEOUT = 25000;

const BOOTSTRAP_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />
  </head>
  <body style="margin:0;background:#000;"></body>
</html>
`;

const EMBED_USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36';

const INTERCEPT_JS = `
(function () {
  if (window.__musicPlayerInterceptorInstalled) {
    return true;
  }
  window.__musicPlayerInterceptorInstalled = true;

  var post = function (payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (error) {}
  };

  var normalize = function (data, source) {
    var formats = (data.streamingData && data.streamingData.adaptiveFormats) || [];
    var audio = [];
    for (var i = 0; i < formats.length; i++) {
      var format = formats[i];
      if (format.url && format.mimeType && format.mimeType.indexOf('audio/') === 0) {
        audio.push({
          url: format.url,
          mimeType: format.mimeType.split(';')[0],
          bitrate: format.bitrate || 0,
          quality: format.audioQuality || ''
        });
      }
    }

    return {
      type: 'streams',
      source: source,
      status: data.playabilityStatus && data.playabilityStatus.status,
      reason: (data.playabilityStatus && data.playabilityStatus.reason) || '',
      streams: audio
    };
  };

  var sendIfPresent = function (data, source) {
    if (!data) {
      return false;
    }
    var payload = normalize(data, source);
    if (payload.status || payload.streams.length > 0) {
      post(payload);
      return true;
    }
    return false;
  };

  var inspectGlobals = function () {
    try {
      if (sendIfPresent(window.ytInitialPlayerResponse, 'ytInitialPlayerResponse')) {
        return true;
      }
    } catch (error) {}

    try {
      var config = window.ytplayer && window.ytplayer.config;
      var playerResponse = config && config.args && config.args.player_response;
      if (playerResponse) {
        if (sendIfPresent(JSON.parse(playerResponse), 'ytplayer.config')) {
          return true;
        }
      }
    } catch (error) {}

    return false;
  };

  post({ type: 'hook-installed', href: window.location.href });
  inspectGlobals();

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__musicPlayerUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    var url = xhr.__musicPlayerUrl || '';
    if (url.indexOf('/youtubei/v1/player') !== -1) {
      post({ type: 'network', method: 'xhr', url: url });
      xhr.addEventListener('load', function () {
        try {
          sendIfPresent(JSON.parse(xhr.responseText), 'xhr');
        } catch (error) {
          post({ type: 'log', message: 'xhr-parse-failed' });
        }
      });
    }
    return originalSend.apply(this, arguments);
  };

  var originalFetch = window.fetch;
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var responsePromise = originalFetch.apply(this, arguments);
    if (url.indexOf('/youtubei/v1/player') !== -1) {
      post({ type: 'network', method: 'fetch', url: url });
      responsePromise.then(function (response) {
        return response.clone().json().then(function (data) {
          sendIfPresent(data, 'fetch');
        });
      }).catch(function () {});
    }
    return responsePromise;
  };

  document.addEventListener('readystatechange', function () {
    post({ type: 'state', readyState: document.readyState, href: window.location.href });
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      inspectGlobals();
    }
  });

  window.addEventListener('load', function () {
    post({ type: 'page-load', href: window.location.href });
    inspectGlobals();
  });

  window.setInterval(function () {
    inspectGlobals();
  }, 750);
})();
true;
`;

const TRIGGER_PLAYER_JS = `
(function () {
  if (window.__musicPlayerTriggerInstalled) {
    return true;
  }
  window.__musicPlayerTriggerInstalled = true;

  var post = function (payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (error) {}
  };

  var poke = function () {
    try {
      var video = document.querySelector('video');
      if (video) {
        video.muted = true;
        var promise = video.play();
        if (promise && promise.catch) {
          promise.catch(function () {});
        }
      }
    } catch (error) {}

    try {
      var playButton = document.querySelector(
        '.ytp-large-play-button, .ytp-cued-thumbnail-overlay, button[aria-label="Play"]'
      );
      if (playButton && playButton.click) {
        playButton.click();
      }
    } catch (error) {}

    post({ type: 'poke', href: window.location.href });
  };

  poke();
  window.setTimeout(poke, 500);
  window.setTimeout(poke, 1500);
})();
true;
`;

function resetDiagnostics(): DiagnosticState {
  return {
    phase: 'idle',
    loadStarts: 0,
    loadEnds: 0,
    sawHook: false,
    lastEvent: 'idle',
    lastUrl: '',
  };
}

function formatDiagnostics(state: DiagnosticState): string {
  return [
    `phase=${state.phase}`,
    `loadStarts=${state.loadStarts}`,
    `loadEnds=${state.loadEnds}`,
    `hook=${state.sawHook ? 'yes' : 'no'}`,
    `lastEvent=${state.lastEvent}`,
    `lastUrl=${state.lastUrl || 'none'}`,
  ].join(' ');
}

export function extractStreamsViaWebView(
  videoId: string
): Promise<StreamResult[]> {
  return new Promise((resolve, reject) => {
    if (pendingRequest) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new Error('Cancelled'));
      pendingRequest = null;
    }

    const timer = setTimeout(() => {
      const details = getDiagnostics ? getDiagnostics() : 'diagnostics=unavailable';
      pendingRequest = null;
      if (dismissWebView) {
        dismissWebView();
      }
      reject(new Error(`WebView timed out (${details})`));
    }, EXTRACT_TIMEOUT);

    pendingRequest = { videoId, resolve, reject, timer };

    if (!requestVideoId) {
      clearTimeout(timer);
      pendingRequest = null;
      reject(new Error('StreamExtractor not mounted'));
      return;
    }

    requestVideoId(videoId);
  });
}

export function StreamExtractorWebView() {
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const webViewRef = useRef<WebView>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const diagnosticsRef = useRef<DiagnosticState>(resetDiagnostics());

  useEffect(() => {
    requestVideoId = (videoId: string) => {
      diagnosticsRef.current = {
        ...resetDiagnostics(),
        phase: 'bootstrap',
        lastEvent: 'request',
      };
      setActiveRequest({ videoId, phase: 'bootstrap' });
    };

    dismissWebView = () => {
      diagnosticsRef.current = resetDiagnostics();
      setActiveRequest(null);
    };

    getDiagnostics = () => formatDiagnostics(diagnosticsRef.current);

    return () => {
      requestVideoId = null;
      dismissWebView = null;
      getDiagnostics = null;
    };
  }, []);

  useEffect(() => {
    activeRequestRef.current = activeRequest;
    diagnosticsRef.current.phase = activeRequest?.phase ?? 'idle';
  }, [activeRequest]);

  const closeWithError = useCallback((message: string) => {
    if (!pendingRequest) {
      setActiveRequest(null);
      return;
    }

    const req = pendingRequest;
    clearTimeout(req.timer);
    pendingRequest = null;
    const details = formatDiagnostics(diagnosticsRef.current);
    setActiveRequest(null);
    req.reject(new Error(`${message} (${details})`));
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'hook-installed') {
        diagnosticsRef.current.sawHook = true;
        diagnosticsRef.current.lastEvent = 'hook-installed';
        diagnosticsRef.current.lastUrl = msg.href || diagnosticsRef.current.lastUrl;
        return;
      }

      if (msg.type === 'network') {
        diagnosticsRef.current.lastEvent = `${msg.method || 'network'}:/player`;
        diagnosticsRef.current.lastUrl = msg.url || diagnosticsRef.current.lastUrl;
        return;
      }

      if (msg.type === 'page-load') {
        diagnosticsRef.current.lastEvent = 'page-load';
        diagnosticsRef.current.lastUrl = msg.href || diagnosticsRef.current.lastUrl;
        return;
      }

      if (msg.type === 'state') {
        diagnosticsRef.current.lastEvent = `ready:${msg.readyState || 'unknown'}`;
        diagnosticsRef.current.lastUrl = msg.href || diagnosticsRef.current.lastUrl;
        return;
      }

      if (msg.type === 'poke') {
        diagnosticsRef.current.lastEvent = 'poke';
        diagnosticsRef.current.lastUrl = msg.href || diagnosticsRef.current.lastUrl;
        return;
      }

      if (msg.type === 'log') {
        diagnosticsRef.current.lastEvent = msg.message || 'log';
        return;
      }

      if (msg.type !== 'streams' || !pendingRequest) {
        return;
      }

      const req = pendingRequest;
      clearTimeout(req.timer);
      pendingRequest = null;
      diagnosticsRef.current.lastEvent = `streams:${msg.source || 'unknown'}`;
      setActiveRequest(null);

      if (msg.status === 'OK' && Array.isArray(msg.streams) && msg.streams.length > 0) {
        req.resolve(msg.streams);
        return;
      }

      const details = formatDiagnostics(diagnosticsRef.current);
      req.reject(
        new Error(
          `WebView: ${msg.status || 'unknown'}${msg.reason ? ` - ${msg.reason}` : ''} (audio=${msg.streams?.length ?? 0}, source=${msg.source || 'unknown'}, ${details})`
        )
      );
    } catch {
      diagnosticsRef.current.lastEvent = 'message-parse-ignored';
    }
  }, []);

  const handleLoadStart = useCallback((event: any) => {
    diagnosticsRef.current.loadStarts += 1;
    diagnosticsRef.current.lastEvent = 'load-start';
    diagnosticsRef.current.lastUrl = event.nativeEvent.url || diagnosticsRef.current.lastUrl;
  }, []);

  const handleLoadEnd = useCallback((event: any) => {
    diagnosticsRef.current.loadEnds += 1;
    diagnosticsRef.current.lastEvent = 'load-end';
    diagnosticsRef.current.lastUrl = event.nativeEvent.url || diagnosticsRef.current.lastUrl;

    const current = activeRequestRef.current;
    if (!current) {
      return;
    }

    if (current.phase === 'bootstrap') {
      setActiveRequest({ videoId: current.videoId, phase: 'embed' });
      return;
    }

    webViewRef.current?.injectJavaScript(INTERCEPT_JS);
    webViewRef.current?.injectJavaScript(TRIGGER_PLAYER_JS);
  }, []);

  const handleError = useCallback(() => {
    diagnosticsRef.current.lastEvent = 'webview-error';
    closeWithError('WebView: page load failed');
  }, [closeWithError]);

  const handleHttpError = useCallback((event: { nativeEvent: { statusCode: number; url?: string } }) => {
    diagnosticsRef.current.lastEvent = `http-${event.nativeEvent.statusCode}`;
    diagnosticsRef.current.lastUrl = event.nativeEvent.url || diagnosticsRef.current.lastUrl;
    closeWithError(`WebView: HTTP ${event.nativeEvent.statusCode}`);
  }, [closeWithError]);

  if (!activeRequest) {
    return null;
  }

  const source =
    activeRequest.phase === 'bootstrap'
      ? { html: BOOTSTRAP_HTML, baseUrl: 'https://www.youtube.com' }
      : {
          uri: `https://www.youtube.com/embed/${encodeURIComponent(activeRequest.videoId)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&controls=0`,
        };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={`${activeRequest.videoId}:${activeRequest.phase}`}
        ref={webViewRef}
        source={source}
        userAgent={EMBED_USER_AGENT}
        injectedJavaScriptBeforeContentLoaded={INTERCEPT_JS}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleHttpError}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={['*']}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 64,
    height: 64,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: {
    width: 64,
    height: 64,
  },
});
