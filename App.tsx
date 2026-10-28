import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from './src/theme';
import { Navigation } from './src/navigation';
import { setupTrackPlayer } from './src/services/trackPlayerService';
import { ErrorBoundary } from './src/components';
import { StreamExtractorWebView } from './src/services/StreamExtractorWebView';
import { pruneStreamCache } from './src/services/youtube';

export default function App() {
  useEffect(() => {
    setupTrackPlayer();
    pruneStreamCache();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <Navigation />
            <StreamExtractorWebView />
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
