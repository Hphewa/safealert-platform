import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

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
