import { apiBaseUrl } from '@/services/api/client';

export function resolveMediaReferenceUri(mediaReference: string | undefined) {
  if (!mediaReference) {
    return undefined;
  }

  if (/^(https?:|data:|file:)/i.test(mediaReference)) {
    return mediaReference;
  }

  if (mediaReference.startsWith('/')) {
    return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '')}${mediaReference}`;
  }

  return undefined;
}

export function canPreviewImageMedia(mediaReference: string | undefined) {
  return Boolean(mediaReference && /^(https?:|data:image\/|file:)/i.test(mediaReference));
}
