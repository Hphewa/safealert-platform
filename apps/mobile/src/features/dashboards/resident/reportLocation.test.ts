import { describe, expect, it } from 'vitest';

import { applyAdjustedReportLocation, reportLocationToGeoJsonCoordinates } from './reportLocation';
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

  it('converts selected latitude and longitude to GeoJSON coordinate order', () => {
    expect(
      reportLocationToGeoJsonCoordinates({
        latitude: 6.9305,
        longitude: 79.865
      })
    ).toEqual([79.865, 6.9305]);
  });
});
