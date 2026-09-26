import { isValidMapCoordinates, type MapCoordinates } from './types';

export type LeafletMapMessage =
  | { type: 'map_ready' }
  | { type: 'location_changed'; latitude: number; longitude: number }
  | { type: 'map_error'; message?: string }
  | { type: 'tile_error'; message?: string };

export type LeafletSetLocationCommand = {
  type: 'set_location';
  latitude: number;
  longitude: number;
  recenter?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseLeafletMapMessage(data: string): LeafletMapMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  if (parsed.type === 'map_ready') {
    return { type: 'map_ready' };
  }

  if (parsed.type === 'map_error' || parsed.type === 'tile_error') {
    return {
      type: parsed.type,
      ...(typeof parsed.message === 'string' ? { message: parsed.message } : {})
    };
  }

  if (parsed.type === 'location_changed') {
    const coordinates = {
      latitude: Number(parsed.latitude),
      longitude: Number(parsed.longitude)
    };

    if (!isValidMapCoordinates(coordinates)) {
      return null;
    }

    return {
      type: 'location_changed',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    };
  }

  return null;
}

export function createSetLocationCommand(
  coordinates: MapCoordinates,
  recenter: boolean
): LeafletSetLocationCommand | null {
  if (!isValidMapCoordinates(coordinates)) {
    return null;
  }

  return {
    type: 'set_location',
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    recenter
  };
}

export function createLeafletInjectionScript(command: LeafletSetLocationCommand): string {
  return `window.SafeAlertMap && window.SafeAlertMap.receive(${JSON.stringify(command)}); true;`;
}
