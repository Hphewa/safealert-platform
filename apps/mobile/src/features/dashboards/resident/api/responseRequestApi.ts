import type {
  CancelResponseRequestResponse,
  CreateResponseRequestRequest,
  CreateResponseRequestResponse,
  GetResidentResponseRequestResponse,
  GetResidentResponseRequestsResponse,
  UpdateResponseRequestRequest,
  UpdateResponseRequestResponse
} from '@safealert/contracts';
import { EMERGENCY_ASSISTANCE_TYPES, ROAD_ACCESSIBILITIES } from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';
import { parseResidentEmergencyRequestId } from '../emergencyRequestNavigation';

export async function cancelResidentResponseRequest(requestId: string, accessToken: string) {
  if (!accessToken?.trim()) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  const normalizedId = parseResidentEmergencyRequestId(requestId);
  if (!normalizedId) {
    throw new ApiClientError(400, 'INVALID_REQUEST_ID', 'Select a valid emergency request.');
  }
  // Send only the target ID: ownership and current eligibility belong to the backend.
  const response = await apiRequest<CancelResponseRequestResponse>(
    `/response-requests/${normalizedId}/cancel`, { method: 'PATCH', accessToken }
  );
  const cancelled = response?.responseRequest;
  // A status-only response must not replace the details with an incomplete record
  // or claim success. Keep the existing request contract as the single source of data.
  if (parseResidentEmergencyRequestId(cancelled?.id) !== normalizedId
    || cancelled?.status !== 'CANCELLED'
    || typeof cancelled.residentId !== 'string' || !cancelled.residentId.trim()
    || !EMERGENCY_ASSISTANCE_TYPES.includes(cancelled.assistanceType)
    || !ROAD_ACCESSIBILITIES.includes(cancelled.roadAccessibility)
    || cancelled.location?.type !== 'Point' || !Array.isArray(cancelled.location.coordinates)
    || cancelled.location.coordinates.length !== 2 || !cancelled.location.coordinates.every(Number.isFinite)
    || ![cancelled.affectedPeople, cancelled.injuredPeople, cancelled.vulnerablePeople?.children,
      cancelled.vulnerablePeople?.elderlyPeople, cancelled.vulnerablePeople?.personsWithDisabilities,
      cancelled.vulnerablePeople?.pregnantPersons].every((count) => Number.isInteger(count) && count >= 0)
    || typeof cancelled.medicalNeeds !== 'boolean' || typeof cancelled.description !== 'string'
    || typeof cancelled.contact?.name !== 'string' || typeof cancelled.contact?.phoneNumber !== 'string'
    || typeof cancelled.createdAt !== 'string' || !Number.isFinite(Date.parse(cancelled.createdAt))
    || typeof cancelled.updatedAt !== 'string' || !Number.isFinite(Date.parse(cancelled.updatedAt))) {
    throw new ApiClientError(502, 'INVALID_RESPONSE', 'Unable to confirm emergency request cancellation.');
  }
  return response;
}

export async function getMyResponseRequestById(requestId: string, accessToken: string) {
  if (!accessToken.trim()) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  const normalizedId = parseResidentEmergencyRequestId(requestId);
  if (!normalizedId) {
    throw new ApiClientError(400, 'INVALID_REQUEST_ID', 'Select a valid emergency request.');
  }

  // The authenticated backend scopes /mine to the token's resident; no client-selected owner is sent.
  const response = await apiRequest<GetResidentResponseRequestResponse>(
    `/response-requests/mine/${encodeURIComponent(normalizedId)}`, { accessToken }
  );
  if (parseResidentEmergencyRequestId(response?.responseRequest?.id) !== normalizedId) {
    throw new ApiClientError(502, 'INVALID_RESPONSE', 'Unable to load emergency request details.');
  }
  return response;
}

export async function listMyResponseRequests(accessToken: string) {
  if (!accessToken.trim()) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }

  // Ownership comes from the authenticated session, never a resident ID supplied by the client.
  const response = await apiRequest<GetResidentResponseRequestsResponse>('/response-requests/mine', {
    accessToken
  });

  // Reject a malformed list rather than rendering invalid cards or claiming it is an empty result.
  if (!Array.isArray(response?.responseRequests) || response.responseRequests.some(
    (request) => !request || typeof request !== 'object' || !parseResidentEmergencyRequestId(request.id)
  )) {
    throw new ApiClientError(502, 'INVALID_RESPONSE', 'Unable to load emergency requests.');
  }

  return response;
}

export function createResidentResponseRequest(
  input: CreateResponseRequestRequest,
  accessToken: string
) {
  return apiRequest<CreateResponseRequestResponse>('/response-requests', {
    method: 'POST',
    accessToken,
    body: input
  });
}

export async function updateResidentResponseRequest(
  requestId: string,
  input: UpdateResponseRequestRequest,
  accessToken: string
) {
  if (!accessToken?.trim()) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  const normalizedId = parseResidentEmergencyRequestId(requestId);
  if (!normalizedId) {
    throw new ApiClientError(400, 'INVALID_REQUEST_ID', 'Select a valid emergency request.');
  }

  // The authenticated backend scopes /mine to the token's resident; no client-selected owner is sent.
  const response = await apiRequest<UpdateResponseRequestResponse>(
    `/response-requests/mine/${encodeURIComponent(normalizedId)}`,
    {
      method: 'PATCH',
      accessToken,
      body: input
    }
  );

  if (parseResidentEmergencyRequestId(response?.responseRequest?.id) !== normalizedId) {
    throw new ApiClientError(502, 'INVALID_RESPONSE', 'Unable to confirm emergency request update.');
  }

  return response;
}

