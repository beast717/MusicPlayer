# MusicPlayer

A free, open-source music streaming app for iOS built with React Native and Expo. Stream music from YouTube without ads or subscriptions — designed for personal use.

## Features

- **Search & Stream** — Search for any song or artist and stream audio directly via Piped/Invidious APIs
- **Background Playback** — Keep listening with the screen off or while using other apps
- **Playback Controls** — Play, pause, skip, seek, shuffle, and repeat (single track or queue)
- **Download Songs** — Save tracks offline as M4A files with progress tracking
- **Playlists** — Create, rename, and manage custom playlists
- **Favorites** — Like songs for quick access in your Liked Songs collection
- **Library** — Browse your playlists, favorites, and downloads all in one place
- **Audio Quality Settings** — Choose between Low (64 kbps), Medium (128 kbps), or High (256 kbps)
- **Mini Player** — Persistent mini player at the bottom for quick controls while browsing
- **Dark Theme** — Clean, dark UI designed for comfortable use
- **Search History** — Remembers recent searches for quick access
- **Recently Played** — See your listening history on the home screen

## Tech Stack

- [React Native](https://reactnative.dev/) + [Expo](https://expo.dev/) (SDK 55)
- [react-native-track-player](https://github.com/doublesymmetry/react-native-track-player) — Audio playback
- [Zustand](https://github.com/pmndrs/zustand) — State management
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv) — Fast persistent storage
- [Piped](https://github.com/TeamPiped/Piped) / [Invidious](https://github.com/iv-org/invidious) — YouTube API alternatives (no API key needed)
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

## License

This project is for personal use.
