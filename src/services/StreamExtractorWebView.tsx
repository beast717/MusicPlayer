import React, { useRef, useCallback } from 'react';
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
  resolve: (streams: StreamResult[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Singleton state ────────────────────────────────────────────────

let pendingRequest: PendingRequest | null = null;
let webViewRef: WebView | null = null;
let isReady = false;

const EXTRACT_TIMEOUT = 20000; // 20s per video

// Injected JS that hooks into the YouTube embed player to intercept stream data.
// It hooks XMLHttpRequest to capture the /player API response that YouTube's own
// player JS makes, which contains authenticated stream URLs (with PoToken).
const INJECTED_JS = `
(function() {
  // Prevent duplicate injection
  if (window.__streamInterceptorInstalled) return;
  window.__streamInterceptorInstalled = true;

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var url = this.__url || '';

    if (url.indexOf('/youtubei/v1/player') !== -1) {
      var origOnReady = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
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
              type: 'playerResponse',
              status: status,
              reason: reason,
              streams: audio
            }));
          } catch(e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'Parse error: ' + e.message
            }));
          }
        }
        if (origOnReady) origOnReady.apply(this, arguments);
      };
    }
    return originalSend.apply(this, arguments);
  };

  // Also hook fetch() in case YouTube uses it instead of XHR
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var promise = originalFetch.apply(this, arguments);

    if (url.indexOf('/youtubei/v1/player') !== -1) {
      promise.then(function(response) {
        return response.clone().json().then(function(data) {
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
            type: 'playerResponse',
            status: status,
            reason: reason,
            streams: audio
          }));
        });
      }).catch(function() {});
    }
    return promise;
  };

  // Signal ready
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
})();
true;
`;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Extract audio stream URLs for a video by loading YouTube's embed player
 * in a hidden WebView. The WebView handles BotGuard/PoToken automatically.
 */
export function extractStreamsViaWebView(videoId: string): Promise<StreamResult[]> {
  return new Promise((resolve, reject) => {
    if (!webViewRef) {
      reject(new Error('WebView not mounted'));
      return;
    }

    // Cancel any existing pending request
    if (pendingRequest) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new Error('Cancelled by new request'));
      pendingRequest = null;
    }

    const timer = setTimeout(() => {
      if (pendingRequest) {
        pendingRequest = null;
        reject(new Error('WebView extraction timed out'));
      }
    }, EXTRACT_TIMEOUT);

    pendingRequest = { resolve, reject, timer };

    // Load the embed page - YouTube's own JS will make the /player API call
    const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1`;
    webViewRef.injectJavaScript(`
      window.location.href = ${JSON.stringify(embedUrl)};
      true;
    `);
  });
}

// ─── Component ──────────────────────────────────────────────────────

export function StreamExtractorWebView() {
  const ref = useRef<WebView>(null);

  const handleRef = useCallback((instance: WebView | null) => {
    ref.current = instance;
    webViewRef = instance;
    isReady = !!instance;
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'ready') {
        isReady = true;
        return;
      }

      if (data.type === 'playerResponse' && pendingRequest) {
        const req = pendingRequest;
        clearTimeout(req.timer);
        pendingRequest = null;

        if (data.status === 'OK' && data.streams.length > 0) {
          req.resolve(data.streams);
        } else {
          req.reject(
            new Error(
              `WebView: ${data.status || 'unknown'}${data.reason ? ' - ' + data.reason : ''} (audio=${data.streams?.length || 0})`
            )
          );
        }
        return;
      }

      if (data.type === 'error' && pendingRequest) {
        const req = pendingRequest;
        clearTimeout(req.timer);
        pendingRequest = null;
        req.reject(new Error(`WebView: ${data.message}`));
      }
    } catch {
      // Ignore non-JSON messages from the WebView
    }
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={handleRef}
        source={{ uri: 'about:blank' }}
        injectedJavaScript={INJECTED_JS}
        onMessage={handleMessage}
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
