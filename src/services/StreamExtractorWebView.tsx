import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { WEBVIEW_EXTRACTOR_JS } from './generated/webviewExtractor';

/**
 * Hidden WebView that resolves YouTube audio streams with a BotGuard PoToken.
 * The page logic lives in webview-extractor/index.ts; this side mounts it,
 * passes requests in, and performs fetches the page can't make itself.
 */

export interface WebViewStream {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
  contentLength: number;
}

type PageMessage =
  | { type: 'ready' }
  | { type: 'log'; message: string }
  | { type: 'resolve-result'; id: number; ok: true; streams: WebViewStream[] }
  | { type: 'resolve-result'; id: number; ok: false; error: string }
  | {
      type: 'fetch';
      id: number;
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    };

interface PendingRequest {
  resolve: (streams: WebViewStream[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// The first request also waits for BotGuard and YouTube's player JS
const EXTRACT_TIMEOUT = 30000;

// Gives the page the youtube.com origin, so its requests to YouTube are same-origin
const PAGE_ORIGIN = 'https://www.youtube.com/';
const PAGE_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';

// Hosts the page may ask the app to fetch on its behalf
const BRIDGE_FETCH_HOSTS = ['youtube.com', 'googlevideo.com', 'google.com', 'googleapis.com'];

let isMounted = false;
let sendToPage: ((message: object) => void) | null = null;
let queuedMessages: object[] = [];
const pendingRequests = new Map<number, PendingRequest>();
let nextRequestId = 1;

function send(message: object): void {
  if (sendToPage) {
    sendToPage(message);
  } else {
    queuedMessages.push(message);
  }
}

function rejectAll(reason: string): void {
  for (const [id, request] of pendingRequests) {
    clearTimeout(request.timer);
    request.reject(new Error(reason));
    pendingRequests.delete(id);
  }
}

/** Resolve a video's audio streams (PoToken attached) using the given InnerTube client. */
export function extractStreamsViaWebView(
  videoId: string,
  client: string
): Promise<WebViewStream[]> {
  if (!isMounted) {
    return Promise.reject(new Error('StreamExtractor not mounted'));
  }

  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`WebView timed out after ${EXTRACT_TIMEOUT / 1000}s`));
    }, EXTRACT_TIMEOUT);

    pendingRequests.set(id, { resolve, reject, timer });
    send({ type: 'resolve', id, videoId, client });
  });
}

/** Drop the page's session so the next request mints a fresh PoToken. */
export function resetWebViewSession(): void {
  if (isMounted) send({ type: 'reset' });
}

function isBridgeFetchAllowed(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === 'https:' &&
      BRIDGE_FETCH_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

async function performBridgeFetch(
  message: Extract<PageMessage, { type: 'fetch' }>
): Promise<object> {
  if (!isBridgeFetchAllowed(message.url)) {
    return { type: 'fetch-result', id: message.id, ok: false, error: 'Host not allowed' };
  }
  try {
    const response = await fetch(message.url, {
      method: message.method,
      headers: message.headers,
      body: message.body,
      credentials: 'omit',
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      type: 'fetch-result',
      id: message.id,
      ok: true,
      status: response.status,
      headers,
      body: await response.text(),
    };
  } catch (err) {
    return {
      type: 'fetch-result',
      id: message.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Fetch failed',
    };
  }
}

export function StreamExtractorWebView() {
  const webViewRef = useRef<WebView>(null);
  // Bumped to remount the WebView after its content process dies
  const [instance, setInstance] = useState(0);

  useEffect(() => {
    isMounted = true;
    return () => {
      isMounted = false;
      sendToPage = null;
      queuedMessages = [];
      rejectAll('StreamExtractor unmounted');
    };
  }, []);

  const deliver = useCallback((message: object) => {
    webViewRef.current?.injectJavaScript(
      `window.__musicPlayerExtractor && window.__musicPlayerExtractor.receive(${JSON.stringify(message)}); true;`
    );
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: PageMessage;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      switch (message.type) {
        case 'ready': {
          sendToPage = deliver;
          const queued = queuedMessages;
          queuedMessages = [];
          queued.forEach(deliver);
          break;
        }
        case 'resolve-result': {
          const request = pendingRequests.get(message.id);
          if (!request) return;
          pendingRequests.delete(message.id);
          clearTimeout(request.timer);
          if (message.ok) {
            request.resolve(message.streams);
          } else {
            request.reject(new Error(message.error));
          }
          break;
        }
        case 'fetch':
          performBridgeFetch(message).then(deliver);
          break;
        case 'log':
          console.warn('[StreamExtractor]', message.message);
          break;
      }
    },
    [deliver]
  );

  const handleProcessGone = useCallback(() => {
    sendToPage = null;
    rejectAll('WebView process ended');
    setInstance((n) => n + 1);
  }, []);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={instance}
        ref={webViewRef}
        source={{ html: PAGE_HTML, baseUrl: PAGE_ORIGIN }}
        injectedJavaScript={WEBVIEW_EXTRACTOR_JS}
        // No userAgent override: BotGuard checks the page, and a hardcoded
        // browser/OS version that doesn't match the real WebView can get
        // the session's token rejected
        onMessage={handleMessage}
        onContentProcessDidTerminate={handleProcessGone}
        onRenderProcessGone={handleProcessGone}
        javaScriptEnabled
        domStorageEnabled
        // Non-matching URLs would be opened in the system browser; never do that from a hidden page
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
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
});
