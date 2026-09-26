import type { SafeResponseRequest } from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function acceptResponderRequest(requestId: string, accessToken: string) {
  return apiRequest<SafeResponseRequest>(
    `/response-requests/responder/requests/${encodeURIComponent(requestId)}/accept`,
    {
      method: 'PATCH',
      accessToken
    }
  );
}

export function declineResponderRequest(requestId: string, accessToken: string) {
  return apiRequest<SafeResponseRequest>(
    `/response-requests/responder/requests/${encodeURIComponent(requestId)}/decline`,
    {
      method: 'PATCH',
      accessToken
    }
  );
}