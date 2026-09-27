import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse,
  GetResidentResponseRequestResponse,
  GetResidentResponseRequestsResponse
} from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';
import { parseResidentEmergencyRequestId } from '../emergencyRequestNavigation';

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
