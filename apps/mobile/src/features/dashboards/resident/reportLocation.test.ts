import { describe, expect, it } from 'vitest';

import {
  applyAdjustedReportLocation,
  reportGeoJsonToLocationCoordinates,
  reportLocationToGeoJsonCoordinates
} from './reportLocation';
import type { ReportHazardDraft } from './reportDraft';

const baseDraft: ReportHazardDraft = {
  hazardType: 'FLOOD',
  severity: 'HIGH',
  description: 'Water level is rising.',
  location: {
    status: 'DETECTED',
    latitude: 6.9271,
    longitude: 79.8612,
    accuracyMeters: 15,
    capturedAt: '2026-09-23T00:00:00.000Z',
    errorMessage: null
  },
  photoEvidence: {
    status: 'EMPTY',
    selected: null,
    message: null
  }
};

describe('report location helpers', () => {
  it('updates the draft with adjusted coordinates and preserves existing accuracy metadata', () => {
    const result = applyAdjustedReportLocation({
      draft: baseDraft,
      coordinates: {
        latitude: 6.9305,
        longitude: 79.865
      },
      capturedAt: '2026-09-23T01:00:00.000Z'
    });

    expect(result.location).toEqual({
      status: 'DETECTED',
      latitude: 6.9305,
      longitude: 79.865,
      accuracyMeters: 15,
      capturedAt: '2026-09-23T01:00:00.000Z',
      errorMessage: null
    });
  });

  it('sets adjusted draft accuracy to null when there was no detected location', () => {
    const result = applyAdjustedReportLocation({
      draft: {
        ...baseDraft,
        location: {
          status: 'ERROR',
          latitude: null,
          longitude: null,
          errorMessage: 'Location unavailable.'
        }
      },
      coordinates: {
        latitude: 6.9305,
        longitude: 79.865
      },
      capturedAt: '2026-09-23T01:00:00.000Z'
    });

    expect(result.location.status).toBe('DETECTED');
    if (result.location.status === 'DETECTED') {
      expect(result.location.accuracyMeters).toBeNull();
    }
  });

  it('uses GPS accuracy metadata when current location is confirmed from the picker', () => {
    const result = applyAdjustedReportLocation({
      draft: baseDraft,
      coordinates: {
        latitude: 6.931,
        longitude: 79.866
      },
      capturedAt: '2026-09-23T02:00:00.000Z',
      accuracyMeters: 8
    });

    expect(result.location).toMatchObject({
      status: 'DETECTED',
      latitude: 6.931,
      longitude: 79.866,
      accuracyMeters: 8,
      capturedAt: '2026-09-23T02:00:00.000Z'
    });
  });

  it('converts selected latitude and longitude to GeoJSON coordinate order', () => {
    expect(
      reportLocationToGeoJsonCoordinates({
        latitude: 6.9305,
        longitude: 79.865
      })
    ).toEqual([79.865, 6.9305]);
  });

  it('converts GeoJSON report coordinates into UI latitude and longitude order', () => {
    expect(
      reportGeoJsonToLocationCoordinates({
        type: 'Point',
        coordinates: [79.865, 6.9305]
      })
    ).toEqual({
      latitude: 6.9305,
      longitude: 79.865
    });
  });

  it('returns null for invalid report coordinates', () => {
    expect(
      reportGeoJsonToLocationCoordinates({
        type: 'Point',
        coordinates: [200, 95]
      })
    ).toBeNull();
  });
});
