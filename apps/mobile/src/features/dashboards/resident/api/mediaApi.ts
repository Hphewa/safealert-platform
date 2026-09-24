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

  return uploadMultipartFormData(`${apiBaseUrl}/media/report-evidence`, formData, accessToken);
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

function uploadMultipartFormData(url: string, formData: FormData, accessToken: string) {
  return new Promise<UploadReportEvidenceResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('POST', url);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    request.onload = () => {
      const data = parseJsonResponse(request.responseText);

      if (request.status < 200 || request.status >= 300) {
        const apiError =
          typeof data === 'object' && data !== null && 'error' in data
            ? (data as { error?: { code?: string; message?: string } }).error
            : undefined;

        reject(
          new ApiClientError(
            request.status,
            apiError?.code ?? 'API_ERROR',
            apiError?.message ?? 'Upload failed.'
          )
        );
        return;
      }

      resolve(data as UploadReportEvidenceResponse);
    };

    request.onerror = () => {
      reject(
        new ApiClientError(
          0,
          'NETWORK_ERROR',
          `Cannot reach SafeAlert API at ${apiBaseUrl}. Network request failed.`
        )
      );
    };

    request.ontimeout = () => {
      reject(
        new ApiClientError(
          0,
          'NETWORK_ERROR',
          `Cannot reach SafeAlert API at ${apiBaseUrl}. Upload timed out.`
        )
      );
    };

    request.send(formData);
  });
}

function parseJsonResponse(responseText: string) {
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}
