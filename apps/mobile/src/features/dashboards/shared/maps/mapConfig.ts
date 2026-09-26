export const MAP_TILE_URL =
  process.env.EXPO_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_ATTRIBUTION = '\u00A9 OpenStreetMap contributors';
export const MAP_HTML_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export const MAP_MIN_ZOOM = 3;
export const MAP_DEFAULT_ZOOM = 16;
export const MAP_MAX_ZOOM = 19;

export const DEFAULT_MAP_DELTA = {
  latitudeDelta: 0.01,
  longitudeDelta: 0.01
} as const;

export const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
