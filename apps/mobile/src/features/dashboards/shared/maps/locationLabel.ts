import type { GeoJsonPoint } from '@safealert/contracts';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { formatMapCoordinate, geoJsonPointToMapCoordinates } from './types';
import { reverseGeocodePlace } from './locationSearch';

type LocationLabelEntry = { label: string; request: Promise<string> };
// Shared by queue cards, overview, and expanded evidence for this app session.
const labels = new Map<string, LocationLabelEntry>();
let geocodingQueue: Promise<void> = Promise.resolve();

export function locationLabelKey(location: GeoJsonPoint) {
  return location.coordinates.join(',');
}

export function coordinateLocationLabel(location: GeoJsonPoint) {
  const coordinates = geoJsonPointToMapCoordinates(location);
  return coordinates
    ? `${formatMapCoordinate(coordinates.latitude)}, ${formatMapCoordinate(coordinates.longitude)}`
    : 'Location unavailable';
}

export function cachedLocationLabel(location: GeoJsonPoint) {
  return labels.get(locationLabelKey(location))?.label ?? coordinateLocationLabel(location);
}

function addressLabel(address: Location.LocationGeocodedAddress) {
  const detailedAddress = address as Location.LocationGeocodedAddress & {
    name?: string | null;
    street?: string | null;
    postalCode?: string | null;
  };
  const locality = address.city?.trim() || address.district?.trim() || address.subregion?.trim();
  const parts = [
    detailedAddress.name?.trim(),
    detailedAddress.street?.trim(),
    locality,
    address.region?.trim(),
    detailedAddress.postalCode?.trim()
  ].filter((part): part is string => Boolean(part));
  return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(', ');
}

export function resolveLocationLabel(location: GeoJsonPoint): Promise<string> {
  const key = locationLabelKey(location);
  const existing = labels.get(key);
  if (existing) return existing.request;
  const fallback = coordinateLocationLabel(location);
  const coordinates = geoJsonPointToMapCoordinates(location);
  const request = geocodingQueue.then(async () => {
    if (!coordinates) return fallback;
    if (Platform.OS === 'web') {
      return (await reverseGeocodePlace(coordinates.latitude, coordinates.longitude)) || fallback;
    }
    try {
      // Android requires existing permission even for known coordinates. Never prompt or capture GPS here.
      if (Platform.OS === 'android' && (await Location.getForegroundPermissionsAsync()).status !== 'granted') return fallback;
      const addresses = await Location.reverseGeocodeAsync(coordinates);
      return addresses.map(addressLabel).find(Boolean) || fallback;
    } catch {
      return fallback;
    }
  });
  const entry = { label: fallback, request };
  labels.set(key, entry);
  // Serial requests avoid overloading the native geocoder when a queue has many locations.
  geocodingQueue = request.then((label) => { entry.label = label; });
  return request;
}
