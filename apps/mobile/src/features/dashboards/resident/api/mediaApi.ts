import type { UploadReportEvidenceResponse } from '@safealert/contracts';

import { apiBaseUrl, ApiClientError } from '../../../../services/api/client';

type UploadReportEvidenceInput = {
  localUri: string;
  filename: string | null;
  mimeType: string | null;
  accessToken: string;
};

export async function uploadReportEvidence({
  localUri,
  filename,
  mimeType,
  accessToken
}: UploadReportEvidenceInput) {
  const formData = new FormData();
  const resolvedMimeType = mimeType ?? inferMimeType(filename ?? localUri);

  formData.append('file', {
    uri: localUri,
    name: safeFormFilename(filename, resolvedMimeType),
    type: resolvedMimeType
  } as unknown as Blob);

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/media/report-evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: formData
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed.';
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      `Cannot reach SafeAlert API at ${apiBaseUrl}. ${message}`
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error?: { code?: string; message?: string } }).error
        : undefined;

    throw new ApiClientError(
      response.status,
      apiError?.code ?? 'API_ERROR',
      apiError?.message ?? 'Upload failed.'
    );
  }

  return data as UploadReportEvidenceResponse;
}

function inferMimeType(value: string) {
  return /\.png(?:$|\?)/i.test(value) ? 'image/png' : 'image/jpeg';
}

function safeFormFilename(filename: string | null, mimeType: string) {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const baseName = filename?.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (baseName && /\.(jpe?g|png)$/i.test(baseName)) {
    return baseName;
  }

  return `report-evidence.${extension}`;
}
