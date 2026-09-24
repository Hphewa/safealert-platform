import type { CreateReportRequest, CreateReportResponse, UploadReportEvidenceResponse } from '@safealert/contracts';

import type { ReportHazardDraft } from './reportDraft';
import { reportLocationToGeoJsonCoordinates } from './reportLocation';

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
};

type SubmitResidentReportDraftInput = {
  draft: ReportHazardDraft;
  accessToken: string;
  uploadReportEvidence: UploadReportEvidence;
  createResidentReport: CreateResidentReport;
  onEvidenceUploaded?: (mediaReference: string) => void;
};

export async function submitResidentReportDraft({
  draft,
  accessToken,
  uploadReportEvidence,
  createResidentReport,
  onEvidenceUploaded
}: SubmitResidentReportDraftInput): Promise<SubmitResidentReportDraftResult> {
  if (!draft.hazardType || !draft.severity || draft.location.status !== 'DETECTED') {
    throw new Error('Report draft is incomplete.');
  }

  const mediaReference = await ensureReportEvidenceMediaReference({
    draft,
    accessToken,
    uploadReportEvidence,
    onEvidenceUploaded
  });

  const payload: CreateReportRequest = {
    hazardType: draft.hazardType,
    severity: draft.severity,
    description: draft.description.trim(),
    location: {
      type: 'Point',
      coordinates: reportLocationToGeoJsonCoordinates({
        latitude: draft.location.latitude,
        longitude: draft.location.longitude
      })
    },
    ...(mediaReference ? { mediaReference } : {})
  };

  return {
    response: await createResidentReport(payload, accessToken),
    ...(mediaReference ? { mediaReference } : {})
  };
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
