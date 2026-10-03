import type { ArchiveWarningResponse, CancelWarningResponse, CreateWarningRequest, CreateWarningResponse, PublishWarningRequest, PublishWarningResponse, SafeWarning, UpdateWarningRequest, UpdateWarningResponse, UploadWarningImageResponse, WarningAcknowledgementsResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';
import type { WarningPhoto } from '../warningImages';

export function createWarning(input: CreateWarningRequest, accessToken: string) {
  return apiRequest<CreateWarningResponse>('/warnings', { method: 'POST', body: input, accessToken });
}
export function getWarning(id: string, accessToken: string) {
  return apiRequest<{ warning: SafeWarning }>(`/warnings/${encodeURIComponent(id)}`, { accessToken });
}
export function getWarningByAssessment(assessmentId: string, accessToken: string) {
  return apiRequest<{ warning: SafeWarning | null }>(`/warnings/by-assessment/${encodeURIComponent(assessmentId)}`, { accessToken });
}
export function publishWarning(id: string, input: PublishWarningRequest, accessToken: string) {
  return apiRequest<PublishWarningResponse>(`/warnings/${encodeURIComponent(id)}/publish`, { method: 'POST', body: input, accessToken });
}
// LDFEW-115: lifecycle maintenance reuses the same officer auth/channel as publish.
export function updateWarning(id: string, input: UpdateWarningRequest, accessToken: string) {
  return apiRequest<UpdateWarningResponse>(`/warnings/${encodeURIComponent(id)}`, { method: 'PATCH', body: input, accessToken });
}
export function cancelWarning(id: string, accessToken: string) {
  return apiRequest<CancelWarningResponse>(`/warnings/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {}, accessToken });
}
export function archiveWarning(id: string, accessToken: string) {
  return apiRequest<ArchiveWarningResponse>(`/warnings/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {}, accessToken });
}
export function getWarningAcknowledgements(id: string, accessToken: string) {
  return apiRequest<WarningAcknowledgementsResponse>(`/warnings/${encodeURIComponent(id)}/acknowledgements`, { accessToken });
}
export type WarningDeliverySummary = { recipientCount: number; sms: { sent: number; failed: number; skipped: number }; push: { sent: number; failed: number; skipped: number } };
export type FailedWarningDelivery = { id: string; resident: string; channel: 'SMS' | 'PUSH'; status: 'FAILED'; provider?: string; reason: string; attemptCount: number; lastAttemptAt: string; phone?: string };
export function getWarningDelivery(id: string, accessToken: string) {
  return apiRequest<{ summary: WarningDeliverySummary; failedDeliveries: FailedWarningDelivery[] }>(`/warnings/${encodeURIComponent(id)}/delivery`, { accessToken });
}

export async function saveWarningWithPhotos(input: CreateWarningRequest, photos: WarningPhoto[], accessToken: string,
  uploaded: Map<string, string>, onProgress: (message: string) => void, isCurrent: () => boolean = () => true) {
  const attachments: string[] = [];
  for (const [index, photo] of photos.entries()) {
    if (!isCurrent()) throw new Error('Warning creation was interrupted.');
    let reference = uploaded.get(photo.uri);
    if (!reference) {
      onProgress(`Uploading image ${index + 1} of ${photos.length}…`);
      const result = await apiRequest<UploadWarningImageResponse>('/warning-attachments', {
        method: 'POST', accessToken, body: { assessmentId: input.assessmentId, base64: photo.base64 }
      });
      reference = result.reference;
      uploaded.set(photo.uri, reference);
    }
    attachments.push(reference);
  }
  if (!isCurrent()) throw new Error('Warning creation was interrupted.');
  onProgress('Saving Warning…');
  return createWarning({ ...input, attachments }, accessToken);
}
