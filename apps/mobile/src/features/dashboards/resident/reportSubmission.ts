import type {
  CreateReportRequest,
  CreateReportResponse,
  ReportVoiceEvidence,
  UploadReportEvidenceResponse
} from '@safealert/contracts';

import type { ReportHazardDraft } from './reportDraft';
import { reportLocationToGeoJsonCoordinates } from './reportLocation';
import { toReportVoiceEvidence } from '../shared/voice/voiceEvidence';

type UploadReportEvidence = (input: {
  localUri: string;
  filename: string | null;
  mimeType: string | null;
  accessToken: string;
}) => Promise<UploadReportEvidenceResponse>;

type CreateResidentReport = (
  input: CreateReportRequest,
  accessToken: string
) => Promise<CreateReportResponse>;

export type SubmitResidentReportDraftResult = {
  response: CreateReportResponse;
  mediaReference?: string;
  voiceEvidence?: ReportVoiceEvidence;
};

export type ReportSubmissionFailureStage = 'upload' | 'create';

export class ReportSubmissionError extends Error {
  constructor(
    public readonly stage: ReportSubmissionFailureStage,
    public readonly originalError: unknown,
    public readonly mediaReference?: string,
    public readonly voiceEvidence?: ReportVoiceEvidence
  ) {
    super(originalError instanceof Error ? originalError.message : 'Report submission failed.');
    Object.setPrototypeOf(this, ReportSubmissionError.prototype);
  }
}

type SubmitResidentReportDraftInput = {
  draft: ReportHazardDraft;
  accessToken: string;
  uploadReportEvidence: UploadReportEvidence;
  createResidentReport: CreateResidentReport;
  onEvidenceUploaded?: (mediaReference: string) => void;
  onVoiceEvidenceUploaded?: (mediaReference: string) => void;
};

export async function submitResidentReportDraft({
  draft,
  accessToken,
  uploadReportEvidence,
  createResidentReport,
  onEvidenceUploaded,
  onVoiceEvidenceUploaded
}: SubmitResidentReportDraftInput): Promise<SubmitResidentReportDraftResult> {
  if (!draft.hazardType || !draft.severity || draft.location.status !== 'DETECTED') {
    throw new Error('Report draft is incomplete.');
  }

  let mediaReference: string | undefined;
  let voiceEvidence: ReportVoiceEvidence | undefined;

  try {
    mediaReference = await ensureReportEvidenceMediaReference({
      draft,
      accessToken,
      uploadReportEvidence,
      onEvidenceUploaded
    });
    voiceEvidence = await ensureReportVoiceEvidence({
      draft,
      accessToken,
      uploadReportEvidence,
      onVoiceEvidenceUploaded
    });
  } catch (error) {
    throw new ReportSubmissionError('upload', error);
  }

  const payload: CreateReportRequest = {
    hazardType: draft.hazardType,
    ...((draft.otherHazardType ?? '').trim() ? { otherHazardType: draft.otherHazardType?.trim() } : {}),
    severity: draft.severity,
    description: draft.description.trim(),
    location: {
      type: 'Point',
      coordinates: reportLocationToGeoJsonCoordinates({
        latitude: draft.location.latitude,
        longitude: draft.location.longitude
      })
    },
    ...(mediaReference ? { mediaReference } : {}),
    ...(voiceEvidence ? { voiceEvidence } : {})
  };

  try {
    return {
      response: await createResidentReport(payload, accessToken),
      ...(mediaReference ? { mediaReference } : {}),
      ...(voiceEvidence ? { voiceEvidence } : {})
    };
  } catch (error) {
    throw new ReportSubmissionError('create', error, mediaReference, voiceEvidence);
  }
}

async function ensureReportEvidenceMediaReference({
  draft,
  accessToken,
  uploadReportEvidence,
  onEvidenceUploaded
}: Pick<
  SubmitResidentReportDraftInput,
  'draft' | 'accessToken' | 'uploadReportEvidence' | 'onEvidenceUploaded'
>) {
  if (draft.photoEvidence.status !== 'LOCAL_SELECTED') {
    return undefined;
  }

  if (draft.photoEvidence.selected.uploadedMediaReference) {
    return draft.photoEvidence.selected.uploadedMediaReference;
  }

  const upload = await uploadReportEvidence({
    localUri: draft.photoEvidence.selected.localUri,
    filename: draft.photoEvidence.selected.fileName,
    mimeType: draft.photoEvidence.selected.mimeType,
    accessToken
  });

  onEvidenceUploaded?.(upload.mediaReference);

  return upload.mediaReference;
}

async function ensureReportVoiceEvidence({
  draft,
  accessToken,
  uploadReportEvidence,
  onVoiceEvidenceUploaded
}: Pick<
  SubmitResidentReportDraftInput,
  'draft' | 'accessToken' | 'uploadReportEvidence' | 'onVoiceEvidenceUploaded'
>) {
  if (draft.voiceEvidence.status !== 'LOCAL_SELECTED') {
    return undefined;
  }

  const selectedVoice = draft.voiceEvidence.selected;

  if (selectedVoice.uploadedMediaReference) {
    return toReportVoiceEvidence(selectedVoice, selectedVoice.uploadedMediaReference);
  }

  const upload = await uploadReportEvidence({
    localUri: selectedVoice.localUri,
    filename: selectedVoice.fileName,
    mimeType: selectedVoice.mimeType,
    accessToken
  });

  onVoiceEvidenceUploaded?.(upload.mediaReference);

  return toReportVoiceEvidence(selectedVoice, upload.mediaReference);
}
