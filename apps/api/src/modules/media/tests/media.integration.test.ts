import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { reportEvidenceFileSizeLimitBytes } from '../validation/media.schemas.js';

let uploadRoot: string;
let config: ApiConfig;

beforeEach(async () => {
  uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'safealert-media-'));
  config = {
    ...loadConfig(),
    mediaUploadDir: uploadRoot,
    mediaPublicPath: '/api/v1/media'
  };
});

afterEach(async () => {
  await fs.rm(uploadRoot, { recursive: true, force: true });
});

function residentToken() {
  return jwt.sign({ role: 'RESIDENT' }, config.jwtAccessSecret, {
    subject: 'resident-media-user',
    expiresIn: '15m'
  });
}

function volunteerToken() {
  return jwt.sign({ role: 'COMMUNITY_VOLUNTEER' }, config.jwtAccessSecret, {
    subject: 'volunteer-media-user',
    expiresIn: '15m'
  });
}

function app() {
  return createApp({ config });
}

describe('report evidence media upload API', () => {
  it('allows an authenticated resident to upload supported image evidence', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(residentToken(), { type: 'bearer' })
      .attach('file', Buffer.from('fake jpeg content'), {
        filename: 'flood-evidence.jpg',
        contentType: 'image/jpeg'
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      mediaReference: expect.stringMatching(
        /^\/api\/v1\/media\/report-evidence\/\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.jpg$/
      ),
      contentType: 'image/jpeg',
      size: Buffer.byteLength('fake jpeg content'),
      url: expect.stringMatching(
        /^http:\/\/127\.0\.0\.1:\d+\/api\/v1\/media\/report-evidence\/\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.jpg$/
      )
    });

    const storedFileName = path.basename(response.body.mediaReference);
    const storedFile = await fs.readFile(path.join(uploadRoot, 'report-evidence', storedFileName));

    expect(storedFile.toString()).toBe('fake jpeg content');
  });

  it('allows an authenticated community volunteer to upload supported field evidence', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(volunteerToken(), { type: 'bearer' })
      .attach('file', Buffer.from('fake field jpeg content'), {
        filename: 'field-evidence.jpg',
        contentType: 'image/jpeg'
      });

    expect(response.status).toBe(201);
    expect(response.body.mediaReference).toMatch(
      /^\/api\/v1\/media\/report-evidence\/\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.jpg$/
    );
  });

  it('rejects unauthenticated uploads', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .attach('file', Buffer.from('fake jpeg content'), {
        filename: 'flood-evidence.jpg',
        contentType: 'image/jpeg'
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unsupported MIME types', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(residentToken(), { type: 'bearer' })
      .attach('file', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(415);
    expect(response.body.error).toEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Only JPEG and PNG images are supported.'
    });
  });

  it('rejects oversized image uploads', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(residentToken(), { type: 'bearer' })
      .attach('file', Buffer.alloc(reportEvidenceFileSizeLimitBytes + 1), {
        filename: 'large.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toEqual({
      code: 'MEDIA_FILE_TOO_LARGE',
      message: 'Image must be 5 MB or smaller.'
    });
  });

  it('rejects multipart requests without a file', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(residentToken(), { type: 'bearer' })
      .field('description', 'No file attached');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'MEDIA_FILE_REQUIRED',
      message: 'Upload one image file.'
    });
  });

  it('returns a server-controlled mediaReference without trusting the original filename', async () => {
    const response = await request(app())
      .post('/api/v1/media/report-evidence')
      .auth(residentToken(), { type: 'bearer' })
      .attach('file', Buffer.from('fake png content'), {
        filename: '../../resident-device-name.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(201);
    expect(response.body.mediaReference).not.toContain('resident-device-name');
    expect(response.body.mediaReference).not.toContain('..');
    expect(response.body.mediaReference).toMatch(
      /^\/api\/v1\/media\/report-evidence\/\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.png$/
    );
  });
});
