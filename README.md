# MusicPlayer

A free, open-source music streaming app for iOS built with React Native and Expo. Stream music from YouTube without ads or subscriptions — designed for personal use.

## Features

- **Search & Stream** — Search for any song or artist and stream audio directly from YouTube, including protected label music
- **Background Playback** — Keep listening with the screen off or while using other apps
- **Playback Controls** — Play, pause, skip, seek, shuffle, and repeat (single track or queue)
- **Download Songs** — Save tracks offline as M4A files with progress tracking
- **Playlists** — Create, rename, and manage custom playlists
- **Favorites** — Like songs for quick access in your Liked Songs collection
- **Library** — Browse your playlists, favorites, and downloads all in one place
- **Download Quality** — Choose Low (smallest files), Medium (~128 kbps) or High (best available) for downloaded songs
- **Wi-Fi-only Downloads** — Optionally block downloads on cellular data
- **Mini Player** — Persistent mini player at the bottom for quick controls while browsing
- **Dark Theme** — Clean, dark UI designed for comfortable use
- **Search History** — Remembers recent searches for quick access
- **Recently Played** — See your listening history on the home screen

## Tech Stack

- [React Native](https://reactnative.dev/) + [Expo](https://expo.dev/) (SDK 55)
- [react-native-track-player](https://github.com/doublesymmetry/react-native-track-player) — Audio playback
- [Zustand](https://github.com/pmndrs/zustand) — State management
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv) — Fast persistent storage
- [YouTube.js](https://github.com/LuanRT/YouTube.js) + [BgUtils](https://github.com/LuanRT/BgUtils) — Stream extraction and PoToken generation, run in a hidden WebView
- [Lucide Icons](https://lucide.dev/) — Beautiful icon set
- TypeScript

## Installation

### Prerequisites

- An iPhone
- A computer with a USB cable to connect to your iPhone
- A free Apple ID

### Step 1: Build the IPA

The app is built automatically using GitHub Actions:

1. Go to the [Actions tab](../../actions) on this repo
2. Click **"Build iOS IPA"** in the left sidebar
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait ~20 minutes for the build to finish

### Step 2: Download the IPA

1. Once the build shows a green checkmark, click on the completed run
2. Scroll to the **Artifacts** section at the bottom
3. Click **"MusicPlayer-unsigned"** to download the zip
4. Extract it — you'll get `MusicPlayer.ipa`

### Step 3: Install on iPhone

1. Download and install [Sideloadly](https://sideloadly.io/) on your computer
2. Connect your iPhone via USB
3. Open Sideloadly and drag in the `MusicPlayer.ipa` file
4. Enter your Apple ID and click Start
5. On your iPhone, go to **Settings → General → VPN & Device Management** and trust your Apple ID
6. If prompted, enable **Developer Mode** in **Settings → Privacy & Security → Developer Mode**
7. Open the app and enjoy!

> **Note:** With a free Apple ID, the app expires every 7 days and needs to be re-sideloaded. Use [AltStore](https://altstore.io/) to auto-refresh the signature over Wi-Fi.

## Building Locally

```bash
# Install dependencies
npm install

# Generate native iOS project (requires macOS with Xcode)
npx expo prebuild --platform ios --clean

# Build with Xcode
cd ios && pod install
xcodebuild -workspace MusicPlayer.xcworkspace -scheme MusicPlayer -configuration Release -sdk iphoneos
```

## How Streaming Works (and Keeping It Working)

YouTube only serves the first ~1 MB of protected songs (most label music) unless the request carries a **PoToken** from its BotGuard anti-bot system. Without one, those songs fail with a playback error.

The app mounts a hidden WebView whose page has the `youtube.com` origin (`src/services/StreamExtractorWebView.tsx`). Inside it, `webview-extractor/index.ts`:

1. uses **YouTube.js** to open a session and load YouTube's current player JS, which it uses to decipher stream signatures, and
2. uses **BgUtils** to run BotGuard and mint a PoToken bound to that session, which goes on every stream URL.

`src/services/youtube.ts` checks each stream by fetching its last byte before using it, and falls back to InnerTube's app clients for unprotected videos.

YouTube also throttles any single request over ~10 MB to a crawl, and the iOS player asks for whole files, so long tracks (live sets, full albums) would never load. On iOS, playback and downloads therefore go through a small HTTP server inside the app (`modules/stream-proxy`, Swift). It listens on `127.0.0.1` only and answers the player's requests by fetching from YouTube in pieces that grow from 256 KB to 8 MB.

`npm install` bundles the WebView code automatically (`scripts/build-webview-extractor.mjs`). Run `npm run build:extractor` to rebuild it by hand.

**When songs start failing again**, YouTube has usually changed something and the libraries will already have caught up:

```bash
npm update youtubei.js bgutils-js
```

Then rebuild the IPA and re-sideload. Both projects are maintained actively and usually ship fixes within days of a YouTube change.

## License

This project is for personal use.
