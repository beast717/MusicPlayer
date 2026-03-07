import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './src/services/trackPlayerService';

import App from './App';

// Register the TrackPlayer playback service
TrackPlayer.registerPlaybackService(() => PlaybackService);

// Register the app root component
registerRootComponent(App);
