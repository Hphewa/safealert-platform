import { describe, expect, it } from 'vitest';

import {
  geoJsonPointToMapCoordinates,
  isValidMapCoordinates,
  mapRegionFromCoordinates
} from './types';

describe('shared map coordinate helpers', () => {
  it('keeps UI coordinates as latitude and longitude', () => {
    expect(
      geoJsonPointToMapCoordinates({
        type: 'Point',
        coordinates: [79.8612, 6.9271]
      })
    ).toEqual({
      latitude: 6.9271,
      longitude: 79.8612
    });
  });

  it('builds a stable initial map region for picker and preview maps', () => {
    expect(
      mapRegionFromCoordinates({
        latitude: 6.9271,
        longitude: 79.8612
      })
    ).toEqual({
      latitude: 6.9271,
      longitude: 79.8612,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    });
  });

  it('rejects invalid coordinates before maps or requests use them', () => {
    expect(isValidMapCoordinates({ latitude: 95, longitude: 79.8612 })).toBe(false);
    expect(isValidMapCoordinates({ latitude: 6.9271, longitude: 181 })).toBe(false);
    expect(isValidMapCoordinates({ latitude: 6.9271, longitude: 79.8612 })).toBe(true);
  });
});
