import { DEFAULT_MAP_DELTA } from './mapConfig';

export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

export type MapRegion = MapCoordinates & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LocationSelectionMetadata = {
  accuracyMeters?: number | null;
  capturedAt?: string | null;
  source?: 'GPS' | 'MAP';
};

export type GeoJsonPointLocation = {
  type: 'Point';
  coordinates: [number, number];
};

export function isValidMapCoordinates(coordinates: MapCoordinates | null | undefined): coordinates is MapCoordinates {
  return (
    coordinates !== null &&
    coordinates !== undefined &&
    Number.isFinite(coordinates.latitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

export function mapRegionFromCoordinates(
  coordinates: MapCoordinates,
  delta: Pick<MapRegion, 'latitudeDelta' | 'longitudeDelta'> = DEFAULT_MAP_DELTA
): MapRegion {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    latitudeDelta: delta.latitudeDelta,
    longitudeDelta: delta.longitudeDelta
  };
}

export function geoJsonPointToMapCoordinates(location: GeoJsonPointLocation): MapCoordinates | null {
  const [longitude, latitude] = location.coordinates;
  const coordinates = { latitude, longitude };

  return isValidMapCoordinates(coordinates) ? coordinates : null;
}

export function formatMapCoordinate(value: number) {
  return value.toFixed(5);
}
