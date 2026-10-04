import type { Request, RequestHandler } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { LocalMediaStorage } from '../services/localMediaStorage.js';
import { parseSingleFileMultipartBody } from '../services/multipart.js';
import {
  reportEvidenceFieldName,
  reportEvidenceFileSizeLimitBytes
} from '../validation/media.schemas.js';

export function createMediaController(storage: LocalMediaStorage, config: ApiConfig) {
  const uploadReportEvidence: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const body = await readRequestBody(request, reportEvidenceFileSizeLimitBytes + 64 * 1024);
    const file = parseSingleFileMultipartBody(body, request.header('content-type'), reportEvidenceFieldName);
    const result = await storage.storeReportEvidence({
      buffer: file.buffer,
      contentType: file.contentType,
      requestOrigin: `${request.protocol}://${request.get('host') ?? `localhost:${config.port}`}`
    });

    response.status(201).json(result);
  });

  return {
    uploadReportEvidence
  };
}

async function readRequestBody(request: Request, maxBodySizeBytes: number) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maxBodySizeBytes) {
      throw new ApiError(413, 'MEDIA_FILE_TOO_LARGE', 'Evidence file is too large.');
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
