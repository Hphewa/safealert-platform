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

export type EmergencyLocationState = {
  status: 'IDLE' | 'UNAVAILABLE' | 'MANUAL_REVIEW';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  source: 'DEVICE' | 'MANUAL' | null;
  updatedAt: string | null;
  message: string;
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
  phoneNumber: null;
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
    | 'medicalNeeds'
    | 'injuredCount'
    | 'accessCondition'
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
    source: null,
    updatedAt: null,
    message: 'Current location is ready for future GPS integration.'
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
    phoneNumber: null,
    usesAuthenticatedProfile: false
  },
  emergencyDescription: '',
  specialRequirements: '',
  reviewRequestedAt: null
};

export function EmergencyAssistanceDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<EmergencyAssistanceDraft>(initialEmergencyAssistanceDraft);
  const validation = useMemo(() => validateEmergencyAssistanceDraft(draft), [draft]);
  const resetDraft = () => setDraft(initialEmergencyAssistanceDraft);
  const value = useMemo(
    () => ({
      draft,
      setDraft,
      resetDraft,
      validation
    }),
    [draft, validation]
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
  const trimmedDescription = draft.emergencyDescription.trim();
  const trimmedSpecialRequirements = draft.specialRequirements.trim();

  if (!draft.assistanceType) {
    errors.assistanceType = 'Select the type of assistance needed.';
  }

  if (draft.affectedPeopleCount < 1) {
    errors.affectedPeopleCount = 'At least one affected person is required.';
  }

  if (draft.medicalNeeds.requiresMedicalAssistance === null) {
    errors.medicalNeeds = 'Select whether anyone needs medical assistance.';
  }

  if (draft.medicalNeeds.injuredCount < 0) {
    errors.injuredCount = 'Injured people cannot be a negative number.';
  } else if (draft.medicalNeeds.injuredCount > draft.affectedPeopleCount) {
    errors.injuredCount = 'Injured people cannot exceed the total affected people.';
  }

  if (!draft.accessCondition) {
    errors.accessCondition = 'Select the current road or access condition.';
  }

  if (!trimmedDescription) {
    errors.emergencyDescription = 'Enter a short emergency description.';
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
