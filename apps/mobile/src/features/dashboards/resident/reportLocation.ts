import type { ReportHazardDraft } from './reportDraft';

export type ReportLocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type ReportMapRegion = ReportLocationCoordinates & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type ApplyAdjustedReportLocationInput = {
  draft: ReportHazardDraft;
  coordinates: ReportLocationCoordinates;
  capturedAt: string;
};

export function applyAdjustedReportLocation({
  draft,
  coordinates,
  capturedAt
}: ApplyAdjustedReportLocationInput): ReportHazardDraft {
  return {
    ...draft,
    location: {
      status: 'DETECTED',
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracyMeters: draft.location.status === 'DETECTED' ? draft.location.accuracyMeters : null,
      capturedAt,
      errorMessage: null
    }
  };
}

export function reportLocationToGeoJsonCoordinates(coordinates: ReportLocationCoordinates) {
  return [coordinates.longitude, coordinates.latitude] as [longitude: number, latitude: number];
}
