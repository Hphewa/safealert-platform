import type { SafeReport } from '@safealert/contracts';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';

import type { LocalVoiceEvidence } from '../shared/voice/voiceEvidence';

export type HazardType = 'FLOOD' | 'BLOCKED_ROAD' | 'LANDSLIDE' | 'OTHER';
export type HazardSeverity = 'LOW' | 'MODERATE' | 'HIGH';

export type ReportLocationState =
  | {
      status: 'REQUESTING_PERMISSION' | 'LOCATING';
      latitude: null;
      longitude: null;
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
      status: 'PERMISSION_DENIED' | 'ERROR';
      latitude: null;
      longitude: null;
      errorMessage: string;
    };

export type SelectedPhotoEvidence = {
  localUri: string;
  width: number;
  height: number;
  fileName: string | null;
  mimeType: string | null;
  assetId: string | null;
  source: 'MEDIA_LIBRARY' | 'CAMERA';
  needsUpload: boolean;
  uploadedMediaReference: string | null;
};

export type PhotoEvidenceState =
  | {
      status: 'EMPTY';
      selected: null;
      message: string | null;
    }
  | {
      status: 'REQUESTING_PERMISSION' | 'PICKING';
      selected: null;
      message: string;
    }
  | {
      status: 'LOCAL_SELECTED';
      selected: SelectedPhotoEvidence;
      message: string;
    }
  | {
      status: 'PERMISSION_DENIED' | 'ERROR';
      selected: null;
      message: string;
    };

export type VoiceEvidenceState =
  | {
      status: 'EMPTY';
      selected: null;
      message: string | null;
    }
  | {
      status: 'LOCAL_SELECTED';
      selected: LocalVoiceEvidence;
      message: string;
    };

export type ReportHazardDraft = {
  hazardType: HazardType | null;
  otherHazardType?: string;
  location: ReportLocationState;
  photoEvidence: PhotoEvidenceState;
  voiceEvidence: VoiceEvidenceState;
  severity: HazardSeverity | null;
  description: string;
};

export type ReportHazardValidationErrors = Partial<
  Record<'hazardType' | 'otherHazardType' | 'location' | 'severity' | 'description', string>
>;

export type ReportHazardValidationResult = {
  errors: ReportHazardValidationErrors;
  isValid: boolean;
};

type ReportHazardDraftContextValue = {
  draft: ReportHazardDraft;
  setDraft: Dispatch<SetStateAction<ReportHazardDraft>>;
  resetDraft: () => void;
  validation: ReportHazardValidationResult;
  submittedReport: SafeReport | null;
  setSubmittedReport: Dispatch<SetStateAction<SafeReport | null>>;
};

const ReportHazardDraftContext = createContext<ReportHazardDraftContextValue | null>(null);

export const descriptionMaxLength = 500;
export const descriptionMinLength = 3;

export const hazardTypeLabels: Record<HazardType, string> = {
  FLOOD: 'Flood',
  BLOCKED_ROAD: 'Blocked Road',
  LANDSLIDE: 'Landslide',
  OTHER: 'Other'
};

export const severityLabels: Record<HazardSeverity, string> = {
  LOW: 'Low',
  MODERATE: 'Medium',
  HIGH: 'High'
};

const initialReportHazardDraft: ReportHazardDraft = {
  hazardType: null,
  otherHazardType: '',
  location: {
    status: 'REQUESTING_PERMISSION',
    latitude: null,
    longitude: null,
    errorMessage: null
  },
  photoEvidence: {
    status: 'EMPTY',
    selected: null,
    message: null
  },
  voiceEvidence: {
    status: 'EMPTY',
    selected: null,
    message: null
  },
  severity: null,
  description: ''
};

export function ReportHazardDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ReportHazardDraft>(initialReportHazardDraft);
  const [submittedReport, setSubmittedReport] = useState<SafeReport | null>(null);
  const validation = useMemo(() => validateReportHazardDraft(draft), [draft]);
  const resetDraft = () => setDraft(initialReportHazardDraft);
  const value = useMemo(
    () => ({
      draft,
      setDraft,
      resetDraft,
      validation,
      submittedReport,
      setSubmittedReport
    }),
    [draft, submittedReport, validation]
  );

  return (
    <ReportHazardDraftContext.Provider value={value}>{children}</ReportHazardDraftContext.Provider>
  );
}

export function useReportHazardDraft() {
  const context = useContext(ReportHazardDraftContext);

  if (!context) {
    throw new Error('useReportHazardDraft must be used within ReportHazardDraftProvider.');
  }

  return context;
}

export function validateReportHazardDraft(draft: ReportHazardDraft): ReportHazardValidationResult {
  const errors: ReportHazardValidationErrors = {};
  const trimmedDescription = draft.description.trim();

  if (!draft.hazardType) {
    errors.hazardType = 'Select a hazard type.';
  }

  if (draft.hazardType === 'OTHER' && (draft.otherHazardType ?? '').trim().length < 2) {
    errors.otherHazardType = 'Tell us what type of hazard this is.';
  }

  if (draft.location.status !== 'DETECTED') {
    errors.location = 'Location is required.';
  }

  if (!draft.severity) {
    errors.severity = 'Select the observed severity.';
  }

  if (!trimmedDescription) {
    errors.description = 'Enter a short description.';
  } else if (trimmedDescription.length < descriptionMinLength) {
    errors.description = `Enter at least ${descriptionMinLength} characters.`;
  } else if (trimmedDescription.length > descriptionMaxLength) {
    errors.description = `Keep the description under ${descriptionMaxLength} characters.`;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
}
