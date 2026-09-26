import {
  FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH,
  FIELD_CONFIRMATION_REASON_MAX_LENGTH,
  type CreateFieldConfirmationRequest,
  type FieldVerificationChecklist,
  type UnableToConfirmReason
} from '@safealert/contracts';

export const emptyVerificationChecklist: FieldVerificationChecklist = {
  locationMatches: false,
  photoMatches: false,
  situationStillExists: false,
  severityAppearsCorrect: false
};

export function buildConfirmedInput(
  verificationChecklist: FieldVerificationChecklist,
  observation: string,
  mediaReference?: string | null
): CreateFieldConfirmationRequest {
  const normalizedObservation = observation.trim();
  if (normalizedObservation.length > FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH) throw new Error('The observation is too long.');
  return {
    outcome: 'CONFIRMED',
    verificationChecklist,
    ...(normalizedObservation ? { observation: normalizedObservation } : {}),
    ...(mediaReference ? { mediaReference } : {})
  };
}

export function buildUnableToConfirmInput(reason: UnableToConfirmReason | '', details: string): CreateFieldConfirmationRequest {
  if (!reason) throw new Error('Select a reason before submitting.');
  const reasonDetails = details.trim();
  if (reason === 'Other' && !reasonDetails) throw new Error('Describe why you are unable to confirm.');
  if (reasonDetails.length > FIELD_CONFIRMATION_REASON_MAX_LENGTH) throw new Error('The reason is too long.');
  return { outcome: 'UNABLE_TO_CONFIRM', reason, ...(reason === 'Other' ? { reasonDetails } : {}) };
}

export function buildConfirmationInput(outcome: CreateFieldConfirmationRequest['outcome'], reason: UnableToConfirmReason | '', details: string): CreateFieldConfirmationRequest {
  if (outcome === 'CONFIRMED') return buildConfirmedInput(emptyVerificationChecklist, '');
  return buildUnableToConfirmInput(reason, details);
}
