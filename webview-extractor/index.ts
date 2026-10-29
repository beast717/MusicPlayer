/**
 * Runs inside the hidden WebView (see src/services/StreamExtractorWebView.tsx),
 * on a page whose origin is https://www.youtube.com.
 *
 * YouTube only serves the first ~1 MB of protected songs (label music, VEVO,
 * etc.) unless the stream URL carries a PoToken minted by BotGuard. BotGuard
 * needs a real browser, which is why this lives in a WebView:
 *
 *  1. youtubei.js creates a session and loads YouTube's current player JS,
 *     which it uses to decipher stream signatures.
 *  2. bgutils-js runs BotGuard and mints a PoToken bound to the session's
 *     visitor ID. youtubei.js appends it to every deciphered URL (&pot=).
 *
 * Both libraries track YouTube's changes, so keeping them up to date
 * (npm update youtubei.js bgutils-js) is how this keeps working.
 *
 * Built into an IIFE string by scripts/build-webview-extractor.mjs.
 */
import { Innertube, Log, Platform, UniversalCache } from 'youtubei.js/web';
import type { Types } from 'youtubei.js/web';
import { BotGuardClient } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';

// ─── Protocol (mirrored in src/services/StreamExtractorWebView.tsx) ──

export interface ExtractedStream {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
  contentLength: number;
}

type IncomingMessage =
  | { type: 'resolve'; id: number; videoId: string; client: string }
  | { type: 'reset' }
  | {
      type: 'fetch-result';
      id: number;
      ok: boolean;
      status?: number;
      headers?: Record<string, string>;
      body?: string;
      error?: string;
    };

type OutgoingMessage =
  | { type: 'ready' }
  | { type: 'log'; message: string }
  | { type: 'resolve-result'; id: number; ok: true; streams: ExtractedStream[] }
  | { type: 'resolve-result'; id: number; ok: false; error: string }
  | {
      type: 'fetch';
      id: number;
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    __musicPlayerExtractor?: { receive(message: IncomingMessage): void };
  }
}

// iOS 15.1-15.3 WebKit lacks structuredClone; youtubei.js only clones plain JSON data
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = ((value: unknown) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}

function post(message: OutgoingMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Fetch ───────────────────────────────────────────────────────────
// The page's origin is youtube.com, so requests normally go out directly.
// If the WebView ever blocks one (CORS or similar), the app performs it
// natively and hands the response back.

let nextFetchId = 1;
const pendingFetches = new Map<
  number,
  { resolve: (r: Response) => void; reject: (e: Error) => void }
>();

async function nativeFetch(request: Request): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.clone().text();

  const id = nextFetchId++;
  return new Promise<Response>((resolve, reject) => {
    pendingFetches.set(id, { resolve, reject });
    post({ type: 'fetch', id, url: request.url, method: request.method, headers, body });
  });
}

function receiveFetchResult(message: Extract<IncomingMessage, { type: 'fetch-result' }>): void {
  const pending = pendingFetches.get(message.id);
  if (!pending) return;
  pendingFetches.delete(message.id);

  if (!message.ok) {
    pending.reject(new TypeError(message.error || 'Native fetch failed'));
    return;
  }
  const status = message.status ?? 200;
  const nullBody = status === 204 || status === 205 || status === 304;
  pending.resolve(
    new Response(nullBody ? null : message.body ?? '', { status, headers: message.headers })
  );
}

async function youtubeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  try {
    // No cookies: the PoToken is bound to the session's visitor ID, and a
    // visitor cookie left over in the WebView would not match it.
    return await fetch(request.clone(), { credentials: 'omit' });
  } catch (err) {
    // fetch() signals blocked/network-level failures with a TypeError
    if ((err as Error | undefined)?.name !== 'TypeError') throw err;
    return nativeFetch(request);
  }
}

// ─── Session + PoToken ───────────────────────────────────────────────

// Request key YouTube's web player uses for BotGuard attestation.
const BOTGUARD_REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

// Mint a fresh token well before YouTube's stated lifetime runs out.
const MAX_SESSION_AGE_MS = 6 * 60 * 60 * 1000;

interface Session {
  yt: Innertube;
  expiresAt: number;
}

let sessionPromise: Promise<Session> | null = null;

// youtubei.js deciphers signatures by running a script extracted from
// YouTube's player JS. It ends by calling process(n, sp, s).
Platform.shim.eval = async (data: Types.BuildScriptResult, env: Record<string, Types.VMPrimative>) => {
  const args = [env.n, env.sp, env.sig].map((value) => JSON.stringify(value ?? ''));
  return new Function(`${data.output}\nreturn process(${args.join(', ')});`)();
};
Log.setLevel(Log.Level.WARNING, Log.Level.ERROR);

/** Loads the BotGuard interpreter unless its VM global is already there. */
function loadBotGuard(src: string, globalName: string): Promise<void> {
  // Check the global itself: a script tag from an earlier session doesn't
  // guarantee the VM is still defined
  if (Reflect.get(window, globalName)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load BotGuard from ${src}`));
    document.head.appendChild(script);
  });
}

async function createMinter(yt: Innertube): Promise<{ minter: WebPoMinter; ttlSecs: number }> {
  const { bg_challenge: challenge } = await yt.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');
  if (!challenge) throw new Error('YouTube returned no BotGuard challenge');

  const interpreterUrl =
    challenge.interpreter_url.private_do_not_access_or_else_trusted_resource_url_wrapped_value;
  if (!interpreterUrl) throw new Error('BotGuard challenge has no interpreter URL');
  await loadBotGuard(
    interpreterUrl.startsWith('//') ? `https:${interpreterUrl}` : interpreterUrl,
    challenge.global_name
  );

  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.global_name,
    globalObject: window,
  });
  const webPoSignalOutput: WebPoSignalOutput = [];
  const botguardResponse = await botguard.snapshot({ webPoSignalOutput });

  const response = await youtubeFetch(buildURL('GenerateIT', true), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([BOTGUARD_REQUEST_KEY, botguardResponse]),
  });
  if (!response.ok) throw new Error(`GenerateIT returned ${response.status}`);

  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
    (await response.json()) as [string?, number?, number?, string?];
  if (!integrityToken) throw new Error('BotGuard attestation was rejected');

  const minter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput
  );
  return { minter, ttlSecs: estimatedTtlSecs ?? 0 };
}

async function createInnertube(): Promise<Innertube> {
  const options = { fetch: youtubeFetch, retrieve_player: true, generate_session_locally: false };
  try {
    // Caches YouTube's player JS in IndexedDB so it isn't re-downloaded on every launch
    return await Innertube.create({ ...options, cache: new UniversalCache(true) });
  } catch {
    return Innertube.create(options);
  }
}

async function createSession(): Promise<Session> {
  const yt = await createInnertube();
  const visitorData = yt.session.context.client.visitorData;
  if (!visitorData) throw new Error('YouTube returned no visitor ID');
  if (!yt.session.player) throw new Error('Could not load the YouTube player');

  const { minter, ttlSecs } = await createMinter(yt);
  yt.session.player.po_token = await minter.mintAsWebsafeString(visitorData);

  const lifetimeMs = ttlSecs > 0 ? Math.min(ttlSecs * 1000 * 0.9, MAX_SESSION_AGE_MS) : MAX_SESSION_AGE_MS;
  return { yt, expiresAt: Date.now() + lifetimeMs };
}

async function getSession(): Promise<Session> {
  if (!sessionPromise) {
    const created = createSession();
    sessionPromise = created;
    created.catch(() => {
      if (sessionPromise === created) sessionPromise = null;
    });
  }
  const session = await sessionPromise;
  if (Date.now() < session.expiresAt) return session;

  sessionPromise = null;
  return getSession();
}

// ─── Stream resolution ───────────────────────────────────────────────

async function resolveStreams(videoId: string, client: string): Promise<ExtractedStream[]> {
  const { yt } = await getSession();
  const info = await yt.getBasicInfo(videoId, { client: client as Types.InnerTubeClient });

  const status = info.playability_status?.status;
  if (status !== 'OK') {
    const reason = info.playability_status?.reason;
    throw new Error(`${client}: ${status ?? 'UNKNOWN'}${reason ? ` ${reason}` : ''}`);
  }

  const audioFormats = (info.streaming_data?.adaptive_formats ?? []).filter(
    (format) => format.has_audio && !format.has_video
  );

  const streams: ExtractedStream[] = [];
  for (const format of audioFormats) {
    try {
      const url = await format.decipher(yt.session.player);
      if (!url) continue;
      streams.push({
        url,
        mimeType: format.mime_type.split(';')[0],
        bitrate: format.bitrate || 0,
        quality: format.audio_quality || '',
        contentLength: Number(format.content_length) || 0,
      });
    } catch {
      // A format that fails to decipher is skipped; the rest may still work
    }
  }

  if (streams.length === 0) {
    throw new Error(`${client}: no playable audio formats (${audioFormats.length} found)`);
  }
  return streams;
}

// ─── Entry point ─────────────────────────────────────────────────────

function receive(message: IncomingMessage): void {
  switch (message.type) {
    case 'resolve':
      resolveStreams(message.videoId, message.client).then(
        (streams) => post({ type: 'resolve-result', id: message.id, ok: true, streams }),
        (err) => post({ type: 'resolve-result', id: message.id, ok: false, error: errorMessage(err) })
      );
      break;
    case 'reset':
      sessionPromise = null;
      break;
    case 'fetch-result':
      receiveFetchResult(message);
      break;
  }
}

window.__musicPlayerExtractor = { receive };
post({ type: 'ready' });

// Warm up so the first song doesn't wait for BotGuard and the player JS
getSession().catch((err) => post({ type: 'log', message: `Warm-up failed: ${errorMessage(err)}` }));
