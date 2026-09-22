import type { CreateFieldConfirmationRequest, CreateFieldConfirmationResponse, GetFieldConfirmationsResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';

export function listMyFieldConfirmations(accessToken: string) {
  return apiRequest<GetFieldConfirmationsResponse>('/field-confirmations/mine', { accessToken });
}

export function submitFieldConfirmation(reportId: string, input: CreateFieldConfirmationRequest, accessToken: string) {
  const action = input.outcome === 'CONFIRMED' ? 'confirm' : 'unable-to-confirm';
  const body = input.outcome === 'CONFIRMED' ? {} : {
    reason: input.reason, ...(input.reasonDetails ? { reasonDetails: input.reasonDetails } : {})
  };
  return apiRequest<CreateFieldConfirmationResponse>(`/field-confirmations/${encodeURIComponent(reportId)}/${action}`, {
    method: 'POST', accessToken, body
  });
}
