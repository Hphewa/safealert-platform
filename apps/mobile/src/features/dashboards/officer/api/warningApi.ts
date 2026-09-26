import type { CreateWarningRequest, CreateWarningResponse, PublishWarningRequest, PublishWarningResponse, SafeWarning, UploadWarningImageResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';
import type { WarningPhoto } from '../warningImages';

export function createWarning(input: CreateWarningRequest, accessToken: string) {
  return apiRequest<CreateWarningResponse>('/warnings', { method: 'POST', body: input, accessToken });
}
export function getWarning(id: string, accessToken: string) {
  return apiRequest<{ warning: SafeWarning }>(`/warnings/${encodeURIComponent(id)}`, { accessToken });
}
export function publishWarning(id: string, input: PublishWarningRequest, accessToken: string) {
  return apiRequest<PublishWarningResponse>(`/warnings/${encodeURIComponent(id)}/publish`, { method: 'POST', body: input, accessToken });
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
