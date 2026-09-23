import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { UploadReportEvidenceResponse } from '@safealert/contracts';

import type { ApiConfig } from '../../../config/env.js';
import { ApiError } from '../../../shared/apiError.js';
import {
  isSupportedReportEvidenceContentType,
  reportEvidenceFileSizeLimitBytes,
  type SupportedReportEvidenceContentType
} from '../validation/media.schemas.js';

type StoreReportEvidenceInput = {
  buffer: Buffer;
  contentType: string;
  requestOrigin: string;
};

const extensionByContentType: Record<SupportedReportEvidenceContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

export class LocalMediaStorage {
  constructor(private readonly config: ApiConfig) {}

  async storeReportEvidence(input: StoreReportEvidenceInput): Promise<UploadReportEvidenceResponse> {
    if (!isSupportedReportEvidenceContentType(input.contentType)) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG and PNG images are supported.');
    }

    if (input.buffer.length > reportEvidenceFileSizeLimitBytes) {
      throw new ApiError(413, 'MEDIA_FILE_TOO_LARGE', 'Image must be 5 MB or smaller.');
    }

    const extension = extensionByContentType[input.contentType];
    const filename = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${extension}`;
    const storageDirectory = path.resolve(this.config.mediaUploadDir, 'report-evidence');
    const targetPath = path.resolve(storageDirectory, filename);

    if (!targetPath.startsWith(`${storageDirectory}${path.sep}`)) {
      throw new ApiError(400, 'INVALID_MEDIA_PATH', 'Invalid media path.');
    }

    await fs.mkdir(storageDirectory, { recursive: true });
    await fs.writeFile(targetPath, input.buffer, { flag: 'wx' });

    const mediaReference = `${this.config.mediaPublicPath}/report-evidence/${filename}`;

    return {
      mediaReference,
      contentType: input.contentType,
      size: input.buffer.length,
      url: new URL(mediaReference, input.requestOrigin).toString()
    };
  }
}
