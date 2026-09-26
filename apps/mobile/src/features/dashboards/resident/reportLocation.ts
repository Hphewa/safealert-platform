import type { ReportHazardDraft } from './reportDraft';
import {
  geoJsonPointToMapCoordinates,
  type LocationSelectionMetadata,
  type MapCoordinates,
  type MapRegion
} from '../shared/maps/types';

export type ReportLocationCoordinates = MapCoordinates;
export type ReportMapRegion = MapRegion;

type ApplyAdjustedReportLocationInput = {
  draft: ReportHazardDraft;
  coordinates: ReportLocationCoordinates;
  capturedAt: string;
  accuracyMeters?: number | null;
};

export function applyAdjustedReportLocation({
  draft,
  coordinates,
  capturedAt,
  accuracyMeters
}: ApplyAdjustedReportLocationInput): ReportHazardDraft {
  return {
    ...draft,
    location: {
      status: 'DETECTED',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracyMeters:
        accuracyMeters !== undefined
          ? accuracyMeters
          : draft.location.status === 'DETECTED'
            ? draft.location.accuracyMeters
            : null,
      capturedAt,
      errorMessage: null
    }
  };
}

export function reportLocationToGeoJsonCoordinates(coordinates: ReportLocationCoordinates) {
  return [coordinates.longitude, coordinates.latitude] as [longitude: number, latitude: number];
}

export function reportGeoJsonToLocationCoordinates(location: Parameters<typeof geoJsonPointToMapCoordinates>[0]) {
  return geoJsonPointToMapCoordinates(location);
}

export function locationSelectionCapturedAt(metadata: LocationSelectionMetadata | undefined) {
  return metadata?.capturedAt ?? new Date().toISOString();
}
