import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../repositories/inMemoryReport.repository.js';

// A real 1x1 PNG, rather than a device-only file URI.
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=';
const payload = {
  hazardType: 'FLOOD', severity: 'HIGH', description: 'Water across the road.',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  photo: { base64 }
};

describe('report evidence transfer', () => {
  let directory: string;
  let app: ReturnType<typeof createApp>;
  let repository: InMemoryReportRepository;
  const config = { ...loadConfig(), jwtAccessSecret: 'evidence-test-secret' };
  const token = (role: string, id = 'resident-1') =>
    jwt.sign({ role }, config.jwtAccessSecret, { subject: id, expiresIn: '15m' });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'safealert-evidence-test-'));
    repository = new InMemoryReportRepository();
    app = createApp({
      config: { ...config, reportEvidenceDirectory: directory },
      authRepository: new InMemoryAuthRepository(), reportRepository: repository
    });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function submit(body = payload) {
    return request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${token('RESIDENT')}`).send(body);
  }

  it('preserves selected photo bytes across submission and officer retrieval', async () => {
    const created = await submit();
    expect(created.status).toBe(201);
    expect(created.body.report.mediaReference).toMatch(/^report-evidence\/[\da-f-]+\.png$/);
    expect(created.body.report).not.toHaveProperty('photo');
    const stored = await repository.findReportById(created.body.report.id);
    expect(stored).not.toHaveProperty('photo');
    const detail = await request(app).get(`/api/v1/reports/officer/${created.body.report.id}`)
      .set('Authorization', `Bearer ${token('DISASTER_OFFICER', 'officer-1')}`);
    expect(detail.body.report.mediaReference).toBe(created.body.report.mediaReference);
    const image = await request(app).get(`/api/v1/reports/${created.body.report.id}/evidence`)
      .set('Authorization', `Bearer ${token('DISASTER_OFFICER', 'officer-1')}`);
    expect(image.status).toBe(200);
    expect(image.body.dataUri).toBe(`data:image/png;base64,${base64}`);
    expect(image.headers['cache-control']).toBe('private, no-store');
  });

  it('requires authentication and prevents other residents and responders reading evidence', async () => {
    const created = await submit();
    const path = `/api/v1/reports/${created.body.report.id}/evidence`;
    expect((await request(app).get(path)).status).toBe(401);
    for (const [role, id, status] of [
      ['RESIDENT', 'resident-1', 200], ['RESIDENT', 'resident-2', 403],
      ['EMERGENCY_RESPONDER', 'responder-1', 403], ['COMMUNITY_VOLUNTEER', 'volunteer-1', 200]
    ] as const) {
      expect((await request(app).get(path).set('Authorization', `Bearer ${token(role, id)}`)).status).toBe(status);
    }
  });

  it.each(['not base64!', Buffer.from('<svg>not an accepted photo</svg>').toString('base64')])(
    'rejects invalid image data instead of silently dropping it: %s', async (invalid) => {
      expect((await submit({ ...payload, photo: { base64: invalid } })).status).toBe(400);
      expect(await repository.findReportsByStatuses(['PENDING'])).toEqual([]);
      expect(await readdir(directory)).toEqual([]);
    }
  );

  it('does not allow clients to attach another report’s stored evidence reference', async () => {
    const created = await submit();
    const result = await request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${token('RESIDENT', 'resident-2')}`)
      .send({ ...payload, photo: undefined, mediaReference: created.body.report.mediaReference });
    expect(result.status).toBe(400);
  });

  it('removes the uploaded file when saving the report fails', async () => {
    repository.createReport = async () => { throw new Error('Database unavailable'); };
    expect((await submit()).status).toBe(500);
    expect(await readdir(directory)).toEqual([]);
  });

  it('reports oversized request bodies as a photo size error', async () => {
    const result = await submit({ ...payload, photo: { base64: 'A'.repeat(7 * 1024 * 1024) } });
    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(await readdir(directory)).toEqual([]);
  });

  it('returns not found for a report without uploaded evidence', async () => {
    const created = await request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${token('RESIDENT')}`)
      .send({ ...payload, photo: undefined });
    const result = await request(app).get(`/api/v1/reports/${created.body.report.id}/evidence`)
      .set('Authorization', `Bearer ${token('DISASTER_OFFICER')}`);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('EVIDENCE_NOT_FOUND');
  });

  it('keeps evidence available after an API restart and officer verification', async () => {
    const created = await submit();
    await request(app).patch(`/api/v1/reports/${created.body.report.id}/verification`)
      .set('Authorization', `Bearer ${token('DISASTER_OFFICER')}`).send({ action: 'VERIFY' });
    const restartedApp = createApp({
      config: { ...config, reportEvidenceDirectory: directory },
      authRepository: new InMemoryAuthRepository(), reportRepository: repository
    });
    const path = `/api/v1/reports/${created.body.report.id}/evidence`;
    const image = await request(restartedApp).get(path)
      .set('Authorization', `Bearer ${token('DISASTER_OFFICER')}`);
    expect(image.body.dataUri).toBe(`data:image/png;base64,${base64}`);
    expect((await request(restartedApp).get(path)
      .set('Authorization', `Bearer ${token('COMMUNITY_VOLUNTEER')}`)).status).toBe(403);
  });
});
