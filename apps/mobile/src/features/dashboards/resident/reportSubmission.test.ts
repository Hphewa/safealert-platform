import type { CreateReportResponse, UploadReportEvidenceResponse } from '@safealert/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ReportSubmissionError, submitResidentReportDraft } from './reportSubmission';
import type { ReportHazardDraft } from './reportDraft';

const reportResponse: CreateReportResponse = {
  report: {
    id: 'report-1',
    residentId: 'resident-1',
    hazardType: 'FLOOD',
    description: 'Water is rising near the bridge.',
    severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    status: 'PENDING',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z'
  }
};

const uploadResponse: UploadReportEvidenceResponse = {
  mediaReference: '/api/v1/media/report-evidence/photo.jpg',
  contentType: 'image/jpeg',
  size: 12
};

function draftWithPhoto(uploadedMediaReference: string | null = null): ReportHazardDraft {
  return {
    hazardType: 'FLOOD',
    severity: 'HIGH',
    description: 'Water is rising near the bridge.',
    location: {
      status: 'DETECTED',
      latitude: 6.9271,
      longitude: 79.8612,
      accuracyMeters: 12,
      capturedAt: '2026-09-23T00:00:00.000Z',
      errorMessage: null
    },
    photoEvidence: {
      status: 'LOCAL_SELECTED',
      message: 'Photo selected.',
      selected: {
        localUri: 'file:///photo.jpg',
        width: 100,
        height: 100,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        assetId: null,
        source: 'CAMERA',
        needsUpload: uploadedMediaReference === null,
        uploadedMediaReference
      }
    }
  };
}

function draftWithoutPhoto(): ReportHazardDraft {
  return {
    ...draftWithPhoto(),
    photoEvidence: {
      status: 'EMPTY',
      selected: null,
      message: null
    }
  };
}

describe('submitResidentReportDraft', () => {
  it('creates a report without uploading when no photo is selected', async () => {
    const uploadReportEvidence = vi.fn();
    const createResidentReport = vi.fn().mockResolvedValue(reportResponse);

    await submitResidentReportDraft({
      draft: draftWithoutPhoto(),
      accessToken: 'token',
      uploadReportEvidence,
      createResidentReport
    });

    expect(uploadReportEvidence).not.toHaveBeenCalled();
    expect(createResidentReport).toHaveBeenCalledWith(
      expect.objectContaining({
        location: {
          type: 'Point',
          coordinates: [79.8612, 6.9271]
        }
      }),
      'token'
    );
    expect(createResidentReport).toHaveBeenCalledWith(
      expect.not.objectContaining({ mediaReference: expect.any(String) }),
      'token'
    );
  });

  it('uploads selected photo evidence before creating the report with mediaReference', async () => {
    const uploadReportEvidence = vi.fn().mockResolvedValue(uploadResponse);
    const createResidentReport = vi.fn().mockResolvedValue(reportResponse);
    const onEvidenceUploaded = vi.fn();

    await submitResidentReportDraft({
      draft: draftWithPhoto(),
      accessToken: 'token',
      uploadReportEvidence,
      createResidentReport,
      onEvidenceUploaded
    });

    expect(uploadReportEvidence).toHaveBeenCalledWith({
      localUri: 'file:///photo.jpg',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      accessToken: 'token'
    });
    expect(onEvidenceUploaded).toHaveBeenCalledWith(uploadResponse.mediaReference);
    expect(createResidentReport).toHaveBeenCalledWith(
      expect.objectContaining({ mediaReference: uploadResponse.mediaReference }),
      'token'
    );
  });

  it('does not create a report when evidence upload fails', async () => {
    const uploadReportEvidence = vi.fn().mockRejectedValue(new Error('Upload failed.'));
    const createResidentReport = vi.fn();

    await expect(
      submitResidentReportDraft({
        draft: draftWithPhoto(),
        accessToken: 'token',
        uploadReportEvidence,
        createResidentReport
      })
    ).rejects.toMatchObject({
      stage: 'upload',
      originalError: expect.any(Error)
    });

    expect(createResidentReport).not.toHaveBeenCalled();
  });

  it('preserves uploaded mediaReference when report creation fails after upload', async () => {
    const uploadReportEvidence = vi.fn().mockResolvedValue(uploadResponse);
    const createResidentReport = vi.fn().mockRejectedValue(new Error('Report create failed.'));
    const onEvidenceUploaded = vi.fn();

    await expect(
      submitResidentReportDraft({
        draft: draftWithPhoto(),
        accessToken: 'token',
        uploadReportEvidence,
        createResidentReport,
        onEvidenceUploaded
      })
    ).rejects.toMatchObject({
      stage: 'create',
      originalError: expect.any(Error),
      mediaReference: uploadResponse.mediaReference
    });

    expect(uploadReportEvidence).toHaveBeenCalledOnce();
    expect(onEvidenceUploaded).toHaveBeenCalledWith(uploadResponse.mediaReference);
    expect(createResidentReport).toHaveBeenCalledWith(
      expect.objectContaining({ mediaReference: uploadResponse.mediaReference }),
      'token'
    );
  });

  it('retries report creation without uploading again after media upload already succeeded', async () => {
    const uploadReportEvidence = vi.fn();
    const createResidentReport = vi.fn().mockResolvedValue(reportResponse);

    await submitResidentReportDraft({
      draft: draftWithPhoto(uploadResponse.mediaReference),
      accessToken: 'token',
      uploadReportEvidence,
      createResidentReport
    });

    expect(uploadReportEvidence).not.toHaveBeenCalled();
    expect(createResidentReport).toHaveBeenCalledWith(
      expect.objectContaining({ mediaReference: uploadResponse.mediaReference }),
      'token'
    );
  });

  it('retries media upload again after upload failure', async () => {
    const uploadReportEvidence = vi.fn()
      .mockRejectedValueOnce(new Error('Upload failed.'))
      .mockResolvedValueOnce(uploadResponse);
    const createResidentReport = vi.fn().mockResolvedValue(reportResponse);
    const draft = draftWithPhoto();

    await expect(
      submitResidentReportDraft({
        draft,
        accessToken: 'token',
        uploadReportEvidence,
        createResidentReport
      })
    ).rejects.toBeInstanceOf(ReportSubmissionError);

    await submitResidentReportDraft({
      draft,
      accessToken: 'token',
      uploadReportEvidence,
      createResidentReport
    });

    expect(uploadReportEvidence).toHaveBeenCalledTimes(2);
    expect(createResidentReport).toHaveBeenCalledOnce();
  });

  it('keeps draft data on failure and resets only after final success', async () => {
    let draft = draftWithPhoto();
    const originalDraft = draft;
    const resetDraft = vi.fn(() => {
      draft = draftWithoutPhoto();
    });
    const uploadReportEvidence = vi.fn().mockResolvedValue(uploadResponse);
    const createResidentReport = vi.fn()
      .mockRejectedValueOnce(new Error('Report create failed.'))
      .mockResolvedValueOnce(reportResponse);
    const onEvidenceUploaded = vi.fn((mediaReference: string) => {
      if (draft.photoEvidence.status !== 'LOCAL_SELECTED') {
        return;
      }

      draft = {
        ...draft,
        photoEvidence: {
          ...draft.photoEvidence,
          selected: {
            ...draft.photoEvidence.selected,
            needsUpload: false,
            uploadedMediaReference: mediaReference
          }
        }
      };
    });

    await expect(
      submitResidentReportDraft({
        draft,
        accessToken: 'token',
        uploadReportEvidence,
        createResidentReport,
        onEvidenceUploaded
      })
    ).rejects.toBeInstanceOf(ReportSubmissionError);

    expect(resetDraft).not.toHaveBeenCalled();
    expect(draft.description).toBe(originalDraft.description);
    expect(draft.location).toEqual(originalDraft.location);
    expect(draft.photoEvidence.status).toBe('LOCAL_SELECTED');

    await submitResidentReportDraft({
      draft,
      accessToken: 'token',
      uploadReportEvidence,
      createResidentReport,
      onEvidenceUploaded
    });
    resetDraft();

    expect(uploadReportEvidence).toHaveBeenCalledOnce();
    expect(createResidentReport).toHaveBeenCalledTimes(2);
    expect(resetDraft).toHaveBeenCalledOnce();
  });
});
