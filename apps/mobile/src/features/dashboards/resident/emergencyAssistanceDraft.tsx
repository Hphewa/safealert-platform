import type { SafeResponseRequest } from '@safealert/contracts';
import { EMERGENCY_CONTACT_PHONE_MESSAGE, getEmergencyVulnerableCountError, isValidEmergencyContactPhoneNumber } from '@safealert/contracts';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';

export type EmergencyAssistanceType =
  | 'RESCUE_EVACUATION'
  | 'MEDICAL_ASSISTANCE'
  | 'FLOOD_ASSISTANCE'
  | 'SHELTER_RELOCATION'
  | 'OTHER';

export type AccessCondition = 'ACCESSIBLE' | 'LIMITED' | 'BLOCKED' | 'UNKNOWN';

export type EmergencyLocationState =
  | {
      status: 'IDLE' | 'REQUESTING_PERMISSION' | 'LOCATING';
      latitude: null;
      longitude: null;
      accuracyMeters: null;
      capturedAt: null;
      errorMessage: null;
    }
  | {
      status: 'DETECTED';
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      capturedAt: string;
      errorMessage: null;
    }
  | {
      status: 'PERMISSION_DENIED' | 'ERROR' | 'MANUAL_REVIEW';
      latitude: null;
      longitude: null;
      accuracyMeters: null;
      capturedAt: null;
      errorMessage: string;
    };

export type EmergencyMedicalNeeds = {
  requiresMedicalAssistance: boolean | null;
  injuredCount: number;
};

export type VulnerablePeopleCounts = {
  children: number;
  elderlyPeople: number;
  personsWithDisabilities: number;
  pregnantPersons: number;
};

export type EmergencyContactDetails = {
  name: string;
  email: string | null;
  phoneNumber: string;
  usesAuthenticatedProfile: boolean;
};

export type EmergencyAssistanceDraft = {
  assistanceType: EmergencyAssistanceType | null;
  location: EmergencyLocationState;
  affectedPeopleCount: number;
  medicalNeeds: EmergencyMedicalNeeds;
  vulnerablePeople: VulnerablePeopleCounts;
  accessCondition: AccessCondition | null;
  contactDetails: EmergencyContactDetails;
  emergencyDescription: string;
  specialRequirements: string;
  reviewRequestedAt: string | null;
};

export type EmergencyAssistanceValidationErrors = Partial<
  Record<
    | 'assistanceType'
    | 'affectedPeopleCount'
    | 'location'
    | 'injuredCount'
    | 'vulnerablePeople'
    | 'accessCondition'
    | 'contactDetails'
    | 'emergencyDescription'
    | 'specialRequirements',
    string
  >
>;

export type EmergencyAssistanceValidationResult = {
  errors: EmergencyAssistanceValidationErrors;
  isValid: boolean;
};

type EmergencyAssistanceDraftContextValue = {
  draft: EmergencyAssistanceDraft;
  setDraft: Dispatch<SetStateAction<EmergencyAssistanceDraft>>;
  resetDraft: () => void;
  validation: EmergencyAssistanceValidationResult;
  submittedResponseRequest: SafeResponseRequest | null;
  setSubmittedResponseRequest: Dispatch<SetStateAction<SafeResponseRequest | null>>;
};

const EmergencyAssistanceDraftContext = createContext<EmergencyAssistanceDraftContextValue | null>(null);

export const emergencyDescriptionMaxLength = 500;
export const specialRequirementsMaxLength = 300;

export const emergencyAssistanceTypeLabels: Record<EmergencyAssistanceType, string> = {
  RESCUE_EVACUATION: 'Rescue / Evacuation',
  MEDICAL_ASSISTANCE: 'Medical Assistance',
  FLOOD_ASSISTANCE: 'Flood Assistance',
  SHELTER_RELOCATION: 'Shelter / Relocation',
  OTHER: 'Other'
};

export const accessConditionLabels: Record<AccessCondition, string> = {
  ACCESSIBLE: 'Accessible',
  LIMITED: 'Limited',
  BLOCKED: 'Blocked',
  UNKNOWN: 'Unknown'
};

const initialEmergencyAssistanceDraft: EmergencyAssistanceDraft = {
  assistanceType: null,
  location: {
    status: 'IDLE',
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    capturedAt: null,
    errorMessage: null
  },
  affectedPeopleCount: 1,
  medicalNeeds: {
    requiresMedicalAssistance: null,
    injuredCount: 0
  },
  vulnerablePeople: {
    children: 0,
    elderlyPeople: 0,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  accessCondition: null,
  contactDetails: {
    name: '',
    email: null,
    phoneNumber: '',
    usesAuthenticatedProfile: false
  },
  emergencyDescription: '',
  specialRequirements: '',
  reviewRequestedAt: null
};

export function EmergencyAssistanceDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<EmergencyAssistanceDraft>(initialEmergencyAssistanceDraft);
  const [submittedResponseRequest, setSubmittedResponseRequest] = useState<SafeResponseRequest | null>(
    null
  );
  const validation = useMemo(() => validateEmergencyAssistanceDraft(draft), [draft]);
  const resetDraft = () => setDraft(initialEmergencyAssistanceDraft);
  const value = useMemo(
    () => ({
      draft,
      setDraft,
      resetDraft,
      validation,
      submittedResponseRequest,
      setSubmittedResponseRequest
    }),
    [draft, submittedResponseRequest, validation]
  );

  return (
    <EmergencyAssistanceDraftContext.Provider value={value}>
      {children}
    </EmergencyAssistanceDraftContext.Provider>
  );
}

export function useEmergencyAssistanceDraft() {
  const context = useContext(EmergencyAssistanceDraftContext);

  if (!context) {
    throw new Error('useEmergencyAssistanceDraft must be used within EmergencyAssistanceDraftProvider.');
  }

  return context;
}

export function validateEmergencyAssistanceDraft(
  draft: EmergencyAssistanceDraft
): EmergencyAssistanceValidationResult {
  const errors: EmergencyAssistanceValidationErrors = {};
  const trimmedContactName = draft.contactDetails.name.trim();
  const trimmedContactEmail = draft.contactDetails.email?.trim() ?? '';
  const trimmedDescription = draft.emergencyDescription.trim();
  const trimmedSpecialRequirements = draft.specialRequirements.trim();
  const hasValidDetectedCoordinates =
    draft.location.status === 'DETECTED' &&
    draft.location.latitude !== null &&
    draft.location.longitude !== null &&
    Number.isFinite(draft.location.latitude) &&
    Number.isFinite(draft.location.longitude) &&
    draft.location.latitude >= -90 &&
    draft.location.latitude <= 90 &&
    draft.location.longitude >= -180 &&
    draft.location.longitude <= 180;
  const vulnerableCountError = getEmergencyVulnerableCountError(draft.affectedPeopleCount, draft.vulnerablePeople);

  if (!draft.assistanceType) {
    errors.assistanceType = 'Select an assistance type.';
  }

  if (!Number.isInteger(draft.affectedPeopleCount) || draft.affectedPeopleCount < 1) {
    errors.affectedPeopleCount = 'Enter the number of affected people.';
  }

  if (!hasValidDetectedCoordinates) {
    errors.location = 'Current location is required.';
  }

  if (!Number.isInteger(draft.medicalNeeds.injuredCount) || draft.medicalNeeds.injuredCount < 0) {
    errors.injuredCount = 'Injured people cannot be a negative number.';
  } else if (
    draft.medicalNeeds.requiresMedicalAssistance === false &&
    draft.medicalNeeds.injuredCount !== 0
  ) {
    errors.injuredCount = 'Set injured people to 0 when no medical assistance is required.';
  } else if (draft.medicalNeeds.injuredCount > draft.affectedPeopleCount) {
    errors.injuredCount = 'Injured people cannot exceed the total affected people.';
  }

  if (vulnerableCountError) {
    errors.vulnerablePeople = vulnerableCountError;
  }

  if (!draft.accessCondition) {
    errors.accessCondition = 'Select the current road/access condition.';
  }

  if (!trimmedContactName || !trimmedContactEmail) {
    errors.contactDetails = 'Your account contact information is required.';
  } else if (trimmedContactName.length < 2) {
    errors.contactDetails = 'Contact name must be at least 2 characters.';
  } else if (!isValidEmergencyContactPhoneNumber(draft.contactDetails.phoneNumber)) {
    errors.contactDetails = EMERGENCY_CONTACT_PHONE_MESSAGE;
  }

  // Description validation: enforce required text and 3-character minimum matching backend persistence schema
  if (!trimmedDescription) {
    errors.emergencyDescription = 'Describe the emergency.';
  } else if (trimmedDescription.length < 3) {
    errors.emergencyDescription = 'Description must be at least 3 characters.';
  } else if (trimmedDescription.length > emergencyDescriptionMaxLength) {
    errors.emergencyDescription = `Keep the description under ${emergencyDescriptionMaxLength} characters.`;
  }

  if (trimmedSpecialRequirements.length > specialRequirementsMaxLength) {
    errors.specialRequirements = `Keep special requirements under ${specialRequirementsMaxLength} characters.`;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
}
