import type { GeoJsonPoint } from '@safealert/contracts';

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceMeters(from: GeoJsonPoint, to: GeoJsonPoint): number {
  return haversineDistanceKm(
    from.coordinates[1], from.coordinates[0], to.coordinates[1], to.coordinates[0]
  ) * 1000;
}

export function haversineDistanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
) {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitude) * Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
