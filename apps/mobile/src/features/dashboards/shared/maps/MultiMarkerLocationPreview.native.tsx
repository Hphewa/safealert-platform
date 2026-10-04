import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { dashboardTheme } from '../theme';
import { createMultiMarkerHtml, type MultiMarkerLocationPreviewProps } from './multiMarkerHtml';
import { parseMultiMarkerMessage } from './multiMarkerMessages';
import { isValidMapCoordinates } from './types';
export type { MultiMarkerLocation } from './multiMarkerHtml';

export function MultiMarkerLocationPreview(props: MultiMarkerLocationPreviewProps) {
  // A new document gets a new lifecycle and cannot deliver selections to a newer map.
  const html = createMultiMarkerHtml(props.locations);
  return <MapDocument key={html} {...props} html={html} />;
}

function MapDocument({ locations, height = 260, onMarkerSelect, fitRequest = 0,
  accessibilityLabel = 'Community incident report locations', html }: MultiMarkerLocationPreviewProps & { html: string }) {
  const webView = useRef<WebView>(null);
  const alive = useRef(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const validLocations = locations.filter(isValidMapCoordinates);
  const source = useMemo(() => ({ html, baseUrl: 'https://safealert.local' }), [html]);
  useEffect(() => {
    alive.current = true;
    const timeout = setTimeout(() => setState((current) => current === 'loading' ? 'error' : current), 15000);
    return () => { alive.current = false; clearTimeout(timeout); };
  }, [attempt]);
  useEffect(() => {
    if (state === 'ready') webView.current?.injectJavaScript('window.safealertFitMarkers && window.safealertFitMarkers(); true;');
  }, [fitRequest, state]);
  const fail = () => { if (alive.current) setState('error'); };
  if (!validLocations.length) return <View style={[styles.frame, { minHeight: height }]}><Text>Reported locations are unavailable.</Text></View>;
  return <View style={[styles.frame, { height }]}>
    {state !== 'error' ? <WebView key={attempt} ref={webView} accessibilityLabel={accessibilityLabel}
      javaScriptEnabled originWhitelist={['https://safealert.local']} scrollEnabled={false}
      source={source} style={styles.webView} onError={fail} onHttpError={fail}
      onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url === 'https://safealert.local/' || request.url === 'https://safealert.local'}
      onMessage={(event) => {
        if (!alive.current) return;
        const message = parseMultiMarkerMessage(event.nativeEvent.data);
        if (message?.type === 'MAP_READY') setState((current) => current === 'error' ? current : 'ready');
        else if (message?.type === 'MAP_ERROR' || message?.type === 'TILE_ERROR') fail();
        else if (message?.type === 'MARKER_SELECTED' && validLocations.some((item) => item.id === message.id)) onMarkerSelect?.(message.id);
      }} /> : <ScrollView contentContainerStyle={styles.fallback}>
      <Text style={styles.title}>Map unavailable</Text><Text>Map tiles could not be loaded. Locations are still available below.</Text>
      <Pressable accessibilityRole="button" onPress={() => { setState('loading'); setAttempt((value) => value + 1); }}><Text style={styles.action}>Retry map</Text></Pressable>
      {validLocations.map((item) => <Pressable key={item.id} accessibilityRole={onMarkerSelect ? 'button' : undefined} onPress={() => onMarkerSelect?.(item.id)} style={styles.row}>
        <Text>{item.label ?? 'Report'}: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</Text>
      </Pressable>)}
    </ScrollView>}
    {state === 'loading' ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator /><Text>Loading map…</Text></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surfaceMuted },
  webView: { flex: 1, backgroundColor: dashboardTheme.colors.surfaceMuted },
  loading: { position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: 'white', padding: 10, borderRadius: 10, flexDirection: 'row', gap: 8 },
  fallback: { padding: 16, gap: 12 }, title: { fontWeight: '800', fontSize: 17 },
  action: { color: dashboardTheme.colors.primary, paddingVertical: 8, fontWeight: '700' }, row: { paddingVertical: 10 }
});
