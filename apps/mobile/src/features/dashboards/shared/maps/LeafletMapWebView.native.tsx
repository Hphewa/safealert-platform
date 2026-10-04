import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { dashboardTheme } from '../theme';
import { createLeafletMapHtml } from './leafletHtml';
import {
  createLeafletInjectionScript,
  createSetLocationCommand,
  parseLeafletMapMessage
} from './mapMessages';
import { isValidMapCoordinates, type MapCoordinates } from './types';

type LeafletMapWebViewProps = {
  coordinates: MapCoordinates | null;
  editable: boolean;
  onLocationChange?: (coordinates: MapCoordinates) => void;
  recenterRequestKey?: number;
  height?: number;
  title?: string;
};

export function LeafletMapWebView({
  coordinates,
  editable,
  onLocationChange,
  recenterRequestKey = 0,
  height = 360,
  title = 'Hazard location map'
}: LeafletMapWebViewProps) {
  const webViewRef = useRef<WebView | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const validCoordinates = isValidMapCoordinates(coordinates) ? coordinates : null;
  const html = useMemo(
    () => (validCoordinates ? createLeafletMapHtml({ coordinates: validCoordinates, editable }) : null),
    [editable, validCoordinates?.latitude, validCoordinates?.longitude, reloadKey]
  );

  useEffect(() => {
    setIsReady(false);
    setIsLoading(Boolean(validCoordinates));
    setErrorMessage(null);
  }, [editable, validCoordinates?.latitude, validCoordinates?.longitude, reloadKey]);

  useEffect(() => {
    if (!isReady || !validCoordinates) {
      return;
    }

    const command = createSetLocationCommand(validCoordinates, true);

    if (!command) {
      return;
    }

    webViewRef.current?.injectJavaScript(createLeafletInjectionScript(command));
  }, [isReady, recenterRequestKey]);

  useEffect(() => {
    if (!isReady || !validCoordinates) {
      return;
    }

    const command = createSetLocationCommand(validCoordinates, false);

    if (!command) {
      return;
    }

    webViewRef.current?.injectJavaScript(createLeafletInjectionScript(command));
  }, [isReady, validCoordinates?.latitude, validCoordinates?.longitude]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseLeafletMapMessage(event.nativeEvent.data);

    if (!message) {
      return;
    }

    if (message.type === 'map_ready') {
      setIsReady(true);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    if (message.type === 'location_changed') {
      onLocationChange?.({
        latitude: message.latitude,
        longitude: message.longitude
      });
      return;
    }

    if (message.type === 'map_error') {
      setIsLoading(false);
      setErrorMessage('Map could not be loaded. Check your internet connection and try again.');
      return;
    }

    if (message.type === 'tile_error' && !isReady) {
      setErrorMessage('Map tiles are taking longer than expected to load.');
    }
  };

  if (!validCoordinates || !html) {
    return (
      <View style={[styles.stateFrame, { minHeight: height }]}>
        <Text style={styles.stateText}>Choose a valid location before opening the map.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        ref={webViewRef}
        accessibilityLabel={title}
        allowsBackForwardNavigationGestures={false}
        allowsInlineMediaPlayback={false}
        domStorageEnabled={false}
        javaScriptEnabled
        onError={() => {
          setIsLoading(false);
          setErrorMessage('Map could not be loaded. Check your internet connection and try again.');
        }}
        onHttpError={() => {
          setIsLoading(false);
          setErrorMessage('Map could not be loaded. Check your internet connection and try again.');
        }}
        onLoadEnd={() => {
          if (!isReady) {
            setIsLoading(false);
          }
        }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        scrollEnabled={false}
        source={{ html, baseUrl: 'https://safealert.local' }}
        style={styles.webView}
      />

      {isLoading ? (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
          <Text style={styles.overlayText}>Loading map...</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            accessibilityLabel="Try loading map again"
            accessibilityRole="button"
            onPress={() => setReloadKey((current) => current + 1)}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  webView: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  stateFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  stateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  overlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.94)'
  },
  overlayText: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  errorOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.96)'
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  retryButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  pressed: {
    opacity: 0.82
  }
});

