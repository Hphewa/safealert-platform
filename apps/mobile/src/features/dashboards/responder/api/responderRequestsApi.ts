import type { SafeResponseRequest } from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

export function listPendingResponderRequests(accessToken: string) {
  return getResponderRequestQueue('/response-requests/responder/pending', accessToken);
}

export function listAssignedResponderRequests(accessToken: string) {
  return getResponderRequestQueue('/response-requests/responder/assigned', accessToken);
}

export function listCompletedResponderRequests(accessToken: string) {
  return getResponderRequestQueue('/response-requests/responder/completed', accessToken);
}

// LDFEW-266 / LDFEW-355: Fetch single emergency request details for responder to display previously saved updates
export async function getResponderRequestById(requestId: string, accessToken: string): Promise<SafeResponseRequest | null> {
  try {
    const response = await apiRequest<unknown>(
      `/response-requests/responder/requests/${encodeURIComponent(requestId)}`,
      { accessToken }
    );
    if (isSafeResponseRequest(response)) {
      return response;
    }
    return null;
  } catch {
    // Resilient fallback: lookup from assigned and pending queues
    const [assigned, pending] = await Promise.all([
      listAssignedResponderRequests(accessToken).catch(() => []),
      listPendingResponderRequests(accessToken).catch(() => [])
    ]);
    return [...assigned, ...pending].find((r) => r.id === requestId) ?? null;
  }
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
