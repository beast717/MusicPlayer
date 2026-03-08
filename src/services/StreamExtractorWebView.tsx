import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

// ─── Types ──────────────────────────────────────────────────────────

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

// ─── Singleton bridge ───────────────────────────────────────────────

let pendingRequest: PendingRequest | null = null;
let requestVideoId: ((videoId: string) => void) | null = null;
let dismissWebView: (() => void) | null = null;

const EXTRACT_TIMEOUT = 20000;

// JS injected before content loads on EVERY page navigation.
// Hooks XHR and fetch to intercept YouTube's /player API response.
const INTERCEPT_JS = `
(function() {
  if (window.__intercepted) return;
  window.__intercepted = true;

  function sendStreams(data) {
    var formats = (data.streamingData && data.streamingData.adaptiveFormats) || [];
    var audio = [];
    for (var i = 0; i < formats.length; i++) {
      var f = formats[i];
      if (f.url && f.mimeType && f.mimeType.indexOf('audio/') === 0) {
        audio.push({
          url: f.url,
          mimeType: f.mimeType.split(';')[0],
          bitrate: f.bitrate || 0,
          quality: f.audioQuality || ''
        });
      }
    }
    var status = data.playabilityStatus && data.playabilityStatus.status;
    var reason = (data.playabilityStatus && data.playabilityStatus.reason) || '';
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'streams',
      status: status,
      reason: reason,
      streams: audio
    }));
  }

  // Hook XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) {
    this._u = u;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    if ((xhr._u || '').indexOf('/youtubei/v1/player') !== -1) {
      xhr.addEventListener('load', function() {
        try { sendStreams(JSON.parse(xhr.responseText)); } catch(e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // Hook fetch
  var origFetch = window.fetch;
  window.fetch = function(input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var p = origFetch.apply(this, arguments);
    if (url.indexOf('/youtubei/v1/player') !== -1) {
      p.then(function(r) {
        return r.clone().json().then(function(d) { sendStreams(d); });
      }).catch(function() {});
    }
    return p;
  };
})();
true;
`;

// ─── Public API ─────────────────────────────────────────────────────

export function extractStreamsViaWebView(
  videoId: string
): Promise<StreamResult[]> {
  return new Promise((resolve, reject) => {
    // Cancel any prior request
    if (pendingRequest) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new Error('Cancelled'));
      pendingRequest = null;
    }

    const timer = setTimeout(() => {
      pendingRequest = null;
      if (dismissWebView) dismissWebView();
      reject(new Error('WebView timed out'));
    }, EXTRACT_TIMEOUT);

    pendingRequest = { videoId, resolve, reject, timer };

    // Tell the component to show a WebView with this videoId
    if (requestVideoId) {
      requestVideoId(videoId);
    } else {
      clearTimeout(timer);
      pendingRequest = null;
      reject(new Error('StreamExtractor not mounted'));
    }
  });
}

// ─── Component ──────────────────────────────────────────────────────

export function StreamExtractorWebView() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  // Register the bridge so extractStreamsViaWebView can trigger renders
  useEffect(() => {
    requestVideoId = (id: string) => setVideoId(id);
    dismissWebView = () => setVideoId(null);
    return () => {
      requestVideoId = null;
      dismissWebView = null;
    };
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'streams' || !pendingRequest) return;

      const req = pendingRequest;
      clearTimeout(req.timer);
      pendingRequest = null;
      setVideoId(null); // unmount WebView

      if (msg.status === 'OK' && msg.streams.length > 0) {
        req.resolve(msg.streams);
      } else {
        req.reject(
          new Error(
            `WebView: ${msg.status || 'unknown'}${msg.reason ? ' - ' + msg.reason : ''} (audio=${msg.streams?.length ?? 0})`
          )
        );
      }
    } catch {
      // ignore non-JSON messages from YouTube page
    }
  }, []);

  const handleError = useCallback(() => {
    if (pendingRequest) {
      const req = pendingRequest;
      clearTimeout(req.timer);
      pendingRequest = null;
      setVideoId(null);
      req.reject(new Error('WebView: page load failed'));
    }
  }, []);

  // Only render the WebView when there's an active extraction request
  if (!videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri: embedUrl }}
        injectedJavaScriptBeforeContentLoaded={INTERCEPT_JS}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleError}
        javaScriptEnabled
        domStorageEnabled
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
    width: 0,
    height: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: -1000,
    left: -1000,
  },
  webview: {
    width: 1,
    height: 1,
  },
});
