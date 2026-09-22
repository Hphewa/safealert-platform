import type { CreateFieldConfirmationRequest, CreateFieldConfirmationResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';

export function submitFieldConfirmation(reportId: string, input: CreateFieldConfirmationRequest, accessToken: string) {
  const action = input.outcome === 'CONFIRMED' ? 'confirm' : 'unable-to-confirm';
  const body = input.outcome === 'CONFIRMED' ? {} : {
    reason: input.reason, ...(input.reasonDetails ? { reasonDetails: input.reasonDetails } : {})
  };
  return apiRequest<CreateFieldConfirmationResponse>(`/field-confirmations/${encodeURIComponent(reportId)}/${action}`, {
    method: 'POST', accessToken, body
  });
}
