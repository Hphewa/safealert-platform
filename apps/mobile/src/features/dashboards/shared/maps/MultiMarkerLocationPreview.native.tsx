import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { dashboardTheme } from '../theme';
import {
  LEAFLET_CSS_URL,
  LEAFLET_JS_URL,
  MAP_DEFAULT_ZOOM,
  MAP_HTML_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_TILE_URL
} from './mapConfig';
import { isValidMapCoordinates, type MapCoordinates } from './types';

export type MultiMarkerLocation = MapCoordinates & {
  id: string;
  label?: string;
};

type MultiMarkerLocationPreviewProps = {
  locations: MultiMarkerLocation[];
  height?: number;
};

export function MultiMarkerLocationPreview({ locations, height = 260 }: MultiMarkerLocationPreviewProps) {
  const validLocations = locations.filter(
    (location): location is MultiMarkerLocation => isValidMapCoordinates(location)
  );
  const html = useMemo(() => createMultiMarkerHtml(validLocations), [validLocations]);

  if (!validLocations.length) {
    return (
      <View style={[styles.empty, { minHeight: height }]}>
        <Text style={styles.emptyText}>Reported locations are unavailable.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        accessibilityLabel="Community incident report locations"
        javaScriptEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        source={{ html, baseUrl: 'https://safealert.local' }}
        style={styles.webView}
      />
    </View>
  );
}

function createMultiMarkerHtml(locations: MultiMarkerLocation[]) {
  const config = JSON.stringify({
    locations,
    tileUrl: MAP_TILE_URL,
    attribution: MAP_HTML_ATTRIBUTION,
    defaultZoom: MAP_DEFAULT_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="${LEAFLET_CSS_URL}" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: #eef2f7; }
    .safealert-marker { width: 24px; height: 24px; border-radius: 999px; background: #2563eb; border: 4px solid #fff; box-shadow: 0 8px 18px rgba(15,23,42,.32); box-sizing: border-box; }
    .leaflet-control-attribution { font-size: 10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="${LEAFLET_JS_URL}"></script>
  <script>
    (function () {
      var config = ${config};
      var points = config.locations.map(function (item) { return [item.latitude, item.longitude]; });
      var center = points.reduce(function (sum, point) { return [sum[0] + point[0], sum[1] + point[1]]; }, [0, 0]);
      center = [center[0] / points.length, center[1] / points.length];
      var map = L.map('map', { zoomControl: true, attributionControl: true }).setView(center, config.defaultZoom);
      L.tileLayer(config.tileUrl, { minZoom: config.minZoom, maxZoom: config.maxZoom, attribution: config.attribution }).addTo(map);
      var icon = L.divIcon({ className: '', html: '<div class="safealert-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      points.forEach(function (point, index) {
        L.marker(point, { draggable: false, icon: icon, title: config.locations[index].label || 'Report location' }).addTo(map);
      });
      if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: config.defaultZoom });
      setTimeout(function () { map.invalidateSize(false); }, 80);
    })();
  </script>
</body>
</html>`;
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  emptyText: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  }
});
