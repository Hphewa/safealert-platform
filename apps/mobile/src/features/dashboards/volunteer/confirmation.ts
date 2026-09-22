import { FIELD_CONFIRMATION_REASON_MAX_LENGTH, type CreateFieldConfirmationRequest, type UnableToConfirmReason } from '@safealert/contracts';

export function buildConfirmationInput(outcome: CreateFieldConfirmationRequest['outcome'], reason: UnableToConfirmReason | '', details: string): CreateFieldConfirmationRequest {
  if (outcome === 'CONFIRMED') return { outcome };
  if (!reason) throw new Error('Select a reason before submitting.');
  const reasonDetails = details.trim();
  if (reason === 'Other' && !reasonDetails) throw new Error('Describe why you are unable to confirm.');
  if (reasonDetails.length > FIELD_CONFIRMATION_REASON_MAX_LENGTH) throw new Error('The reason is too long.');
  return { outcome, reason, ...(reason === 'Other' ? { reasonDetails } : {}) };
}
