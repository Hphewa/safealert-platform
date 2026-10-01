import type { GeoJsonPoint } from '@safealert/contracts';

import { ApiClientError } from '../../../services/api/client';
import { formatOperationalTime } from '../shared/formatOperationalTime';

export function formatIncidentLocation(location: GeoJsonPoint) {
  const [longitude, latitude] = location.coordinates;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function formatIncidentDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters)) return 'Distance unavailable';
  if (distanceMeters < 1000) return `${Math.max(0, Math.round(distanceMeters))} m away`;
  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export function formatIncidentTime(value: string) {
  return formatOperationalTime(value);
}

export function incidentGroupingErrorMessage(error: unknown, fallback = 'Unable to update incident grouping right now.') {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Cannot reach SafeAlert. Check your connection and try again.';
    case 'ACTIVE_INCIDENT_EXISTS':
      return 'This report is already assigned to an active incident. Refresh the candidates before deciding again.';
    case 'REPORT_ALREADY_IN_INCIDENT':
      return 'This report is already part of that incident.';
    case 'INCIDENT_NOT_ACTIVE':
      return 'That incident is no longer active. Refresh the candidates and choose another incident.';
    case 'INCIDENT_HAZARD_MISMATCH':
      return 'This report has a different hazard type and cannot be added to that incident.';
    case 'INVALID_REPORT_STATE':
      return 'Only VERIFIED reports can be grouped into an incident.';
    default:
      return error.message || fallback;
  }
}
