import type { SafeResponseRequest } from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

export function listPendingResponderRequests(accessToken: string) {
  return getResponderRequestQueue('/response-requests/responder/pending', accessToken);
}

export function listAssignedResponderRequests(accessToken: string) {
  return getResponderRequestQueue('/response-requests/responder/assigned', accessToken);
}

async function getResponderRequestQueue(path: string, accessToken: string) {
  const response = await apiRequest<unknown>(path, { accessToken });

  if (!Array.isArray(response)) {
    throw new ApiClientError(0, 'INVALID_API_RESPONSE', 'The responder request queue is invalid.');
  }

  // Ignore malformed records so one incomplete response cannot crash the queue screen.
  return response.filter(isSafeResponseRequest);
}

function isSafeResponseRequest(value: unknown): value is SafeResponseRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.residentId === 'string' &&
    typeof value.assistanceType === 'string' &&
    typeof value.status === 'string' &&
    isGeoJsonPoint(value.location) &&
    typeof value.affectedPeople === 'number' &&
    typeof value.injuredPeople === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isGeoJsonPoint(value: unknown): value is SafeResponseRequest['location'] {
  if (!isRecord(value) || value.type !== 'Point' || !Array.isArray(value.coordinates)) {
    return false;
  }

  return (
    value.coordinates.length === 2 &&
    typeof value.coordinates[0] === 'number' &&
    typeof value.coordinates[1] === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}