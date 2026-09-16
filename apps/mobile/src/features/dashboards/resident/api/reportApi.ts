import { REPORT_PHOTO_MAX_BASE64_LENGTH, type CreateReportRequest, type CreateReportResponse } from '@safealert/contracts';

import { ApiClientError, apiRequest } from '../../../../services/api/client';

export async function createResidentReport(
  input: CreateReportRequest,
  accessToken: string,
  selectedPhoto?: { base64: string | null }
) {
  if (selectedPhoto && !selectedPhoto.base64) {
    throw new ApiClientError(400, 'INVALID_PHOTO', 'The selected photo could not be read. Please select it again.');
  }
  if (selectedPhoto?.base64 && selectedPhoto.base64.length > REPORT_PHOTO_MAX_BASE64_LENGTH) {
    throw new ApiClientError(400, 'PHOTO_TOO_LARGE', 'Photo must be 5 MB or smaller. Please select a smaller photo.');
  }
  return apiRequest<CreateReportResponse>('/reports', {
    method: 'POST',
    accessToken,
    body: {
      ...input,
      ...(selectedPhoto?.base64 ? { photo: { base64: selectedPhoto.base64 } } : {})
    }
  });
}
