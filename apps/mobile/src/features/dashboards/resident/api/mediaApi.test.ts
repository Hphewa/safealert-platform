import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import { uploadReportEvidence } from './mediaApi';

class FakeFormData {
  readonly parts: Array<[string, unknown]> = [];

  append(key: string, value: unknown) {
    this.parts.push([key, value]);
  }
}

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | null = null;

  readonly open = vi.fn();
  readonly setRequestHeader = vi.fn();
  readonly send = vi.fn((body: unknown) => {
    this.sentBody = body;
  });

  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  responseText = '';
  sentBody: unknown = null;
  status = 0;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }
}

describe('uploadReportEvidence', () => {
  beforeEach(() => {
    vi.stubGlobal('FormData', FakeFormData);
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeXMLHttpRequest.latest = null;
  });

  it('uploads React Native uri-backed FormData through XMLHttpRequest', async () => {
    const upload = uploadReportEvidence({
      localUri: 'file:///hazard-photo.jpg',
      filename: 'hazard-photo.jpg',
      mimeType: 'image/jpeg',
      accessToken: 'token'
    });

    const request = expectLatestRequest();
    request.status = 201;
    request.responseText = JSON.stringify({
      mediaReference: '/api/v1/media/report-evidence/photo.jpg',
      contentType: 'image/jpeg',
      size: 12
    });
    request.onload?.();

    await expect(upload).resolves.toEqual({
      mediaReference: '/api/v1/media/report-evidence/photo.jpg',
      contentType: 'image/jpeg',
      size: 12
    });
    expect(request.open).toHaveBeenCalledWith('POST', `${apiBaseUrl}/media/report-evidence`);
    expect(request.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer token');
    expect((request.sentBody as FakeFormData).parts).toEqual([
      [
        'file',
        {
          uri: 'file:///hazard-photo.jpg',
          name: 'hazard-photo.jpg',
          type: 'image/jpeg'
        }
      ]
    ]);
  });

  it('surfaces upload API errors', async () => {
    const upload = uploadReportEvidence({
      localUri: 'file:///hazard-photo.heic',
      filename: 'hazard-photo.heic',
      mimeType: 'image/heic',
      accessToken: 'token'
    });

    const request = expectLatestRequest();
    request.status = 415;
    request.responseText = JSON.stringify({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Only JPEG and PNG images are supported.'
      }
    });
    request.onload?.();

    await expect(upload).rejects.toMatchObject({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Only JPEG and PNG images are supported.'
    });
  });
});

function expectLatestRequest() {
  const request = FakeXMLHttpRequest.latest;

  if (!request) {
    throw new Error('Expected XMLHttpRequest to be created.');
  }

  return request;
}
