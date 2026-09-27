import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse,
  GetResidentResponseRequestsResponse
} from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

export async function listMyResponseRequests(accessToken: string) {
  if (!accessToken.trim()) {
    throw new ApiClientError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }

  // Ownership comes from the authenticated session, never a resident ID supplied by the client.
  const response = await apiRequest<GetResidentResponseRequestsResponse>('/response-requests/mine', {
    accessToken
  });

  if (!Array.isArray(response?.responseRequests)) {
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
