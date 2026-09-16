import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPORT_EVIDENCE_REFERENCE_PREFIX, REPORT_PHOTO_MAX_BYTES, REPORT_PHOTO_MAX_BASE64_LENGTH } from '@safealert/contracts';

import { ApiError } from '../../../shared/apiError.js';

const storedReference = /^report-evidence\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(jpg|png|webp))$/;
const mimeTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

// Files stay outside MongoDB and are served only through authorized report reads.
export class ReportEvidenceStorage {
  private readonly directory: string;

  constructor(directory?: string) {
    this.directory = directory ? resolve(directory)
      : fileURLToPath(new URL('../../../../uploads/report-evidence/', import.meta.url));
  }

  async save(base64: string): Promise<string> {
    if (base64.length > REPORT_PHOTO_MAX_BASE64_LENGTH) {
      throw new ApiError(400, 'PHOTO_TOO_LARGE', 'Photo must be 5 MB or smaller.');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.toString('base64') !== base64) {
      throw new ApiError(400, 'INVALID_PHOTO', 'Photo data is invalid. Please select the photo again.');
    }
    if (bytes.length > REPORT_PHOTO_MAX_BYTES) {
      throw new ApiError(400, 'PHOTO_TOO_LARGE', 'Photo must be 5 MB or smaller.');
    }
    const extension = imageExtension(bytes);
    if (!extension) {
      throw new ApiError(400, 'INVALID_PHOTO', 'Please select a JPEG, PNG, or WebP photo.');
    }
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, filename), bytes, { flag: 'wx' });
    return `${REPORT_EVIDENCE_REFERENCE_PREFIX}${filename}`;
  }

  async read(reference?: string): Promise<string> {
    const match = reference?.match(storedReference);
    if (!match) {
      throw new ApiError(404, 'EVIDENCE_NOT_FOUND', 'No uploaded photo is available for this report.');
    }
    try {
      const bytes = await readFile(join(this.directory, match[1]!));
      const extension = match[2] as keyof typeof mimeTypes;
      return `data:${mimeTypes[extension]};base64,${bytes.toString('base64')}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ApiError(404, 'EVIDENCE_NOT_FOUND', 'This report photo is no longer available.');
      }
      throw error;
    }
  }

  async remove(reference: string): Promise<void> {
    const match = reference.match(storedReference);
    if (match) await unlink(join(this.directory, match[1]!));
  }
}

function imageExtension(bytes: Buffer): keyof typeof mimeTypes | undefined {
  if (bytes.length > 4 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) &&
      bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) return 'jpg';
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return 'png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}
