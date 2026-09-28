import {
  FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH,
  FIELD_CONFIRMATION_REASON_MAX_LENGTH,
  type CreateFieldConfirmationRequest,
  type FieldVerificationChecklist,
  type UnableToConfirmReason
} from '@safealert/contracts';

export type FieldVerificationChecklistDraft = Record<keyof FieldVerificationChecklist, boolean | null>;

export const emptyVerificationChecklist: FieldVerificationChecklist = {
  locationMatches: false,
  photoMatches: false,
  situationStillExists: false,
  severityAppearsCorrect: false
};

export const emptyVerificationChecklistDraft: FieldVerificationChecklistDraft = {
  locationMatches: null,
  photoMatches: null,
  situationStillExists: null,
  severityAppearsCorrect: null
};

export function toExplicitVerificationChecklist(
  verificationChecklist: FieldVerificationChecklistDraft
): FieldVerificationChecklist {
  const entries = Object.entries(verificationChecklist) as Array<[
    keyof FieldVerificationChecklist,
    boolean | null
  ]>;

  if (entries.some(([, value]) => value === null)) {
    throw new Error('Complete all required field checks.');
  }

  return entries.reduce<FieldVerificationChecklist>(
    (result, [key, value]) => ({ ...result, [key]: value === true }),
    { ...emptyVerificationChecklist }
  );
}

export function buildConfirmedInput(
  verificationChecklist: FieldVerificationChecklist | FieldVerificationChecklistDraft,
  observation: string,
  mediaReference?: string | null
): CreateFieldConfirmationRequest {
  const normalizedObservation = observation.trim();
  if (normalizedObservation.length > FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH) throw new Error('The observation is too long.');
  const explicitChecklist = toExplicitVerificationChecklist({
    locationMatches: verificationChecklist.locationMatches,
    photoMatches: verificationChecklist.photoMatches,
    situationStillExists: verificationChecklist.situationStillExists,
    severityAppearsCorrect: verificationChecklist.severityAppearsCorrect
  });
  return {
    outcome: 'CONFIRMED',
    verificationChecklist: explicitChecklist,
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
