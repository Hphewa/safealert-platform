import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';

const reportId = 'abcdef123456789012345601';
const secondId = 'abcdef123456789012345602';
const thirdId = 'abcdef123456789012345603';
const officerId = 'abcdef123456789012345604';
const base = '/api/v1/incidents';
const originalReport: SafeReport = {
  id: reportId, residentId: 'abcdef123456789012345605', hazardType: 'FLOOD',
  description: 'Water is crossing Gale Road.', severity: 'HIGH', status: 'VERIFIED',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  mediaReference: '/api/v1/media/report-evidence/flood.jpg',
  verifiedById: officerId, verifiedAt: '2026-09-25T10:05:00.000Z',
  createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:05:00.000Z'
};

function token(role: UserRole = 'DISASTER_OFFICER') {
  return jwt.sign({ role }, 'test-access-secret', { subject: officerId, expiresIn: '15m' });
}

function context(overrides: Partial<SafeReport> = {}) {
  const reports = new InMemoryReportRepository();
  reports.seedReport(structuredClone({ ...originalReport, ...overrides }));
  const incidents = new InMemoryIncidentRepository();
  const app = createApp({ config: loadConfig(), reportRepository: reports, incidentRepository: incidents });
  const create = (body: object = { reportIds: [reportId] }) =>
    request(app).post(base).auth(token(), { type: 'bearer' }).send(body);
  const get = (id: string) => request(app).get(`${base}/${id}`).auth(token(), { type: 'bearer' });
  return { app, reports, incidents, create, get };
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('incident API', () => {
  it('creates and retrieves an incident from a verified report without changing source evidence', async () => {
    const { create, get, reports, incidents } = context();
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body.incident).toEqual({
      id: expect.stringMatching(/^[a-f\d]{24}$/), hazardType: 'FLOOD',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      reportIds: [reportId], status: 'ACTIVE', createdById: officerId,
      createdAt: expect.any(String), updatedAt: expect.any(String)
    });
    expect(await incidents.findById(response.body.incident.id)).toEqual(response.body.incident);
    expect((await get(response.body.incident.id)).body).toEqual(response.body);
    expect(await reports.findReportById(reportId)).toEqual(originalReport);
  });

  it('accepts several same-hazard verified reports and uses the first report as the location reference', async () => {
    const { reports, create } = context();
    reports.seedReport({ ...originalReport, id: secondId, location: { type: 'Point', coordinates: [79.864, 6.929] } });
    const response = await create({ reportIds: [secondId, reportId] });
    expect(response.status).toBe(201);
    expect(response.body.incident).toMatchObject({
      reportIds: [secondId, reportId], hazardType: 'FLOOD',
      location: { type: 'Point', coordinates: [79.864, 6.929] }
    });
  });

  it.each(['PENDING', 'REJECTED', 'RESOLVED'] as const)('rejects a %s report', async (status) => {
    const { create, incidents } = context({ status });
    const response = await create();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_REPORT_STATE');
    expect(await incidents.findActiveByReportIds([reportId])).toBeNull();
  });

  it('rejects a mixed-hazard batch without attaching any report', async () => {
    const { reports, create, incidents } = context();
    reports.seedReport({ ...originalReport, id: secondId, hazardType: 'LANDSLIDE' });
    const response = await create({ reportIds: [reportId, secondId] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INCIDENT_HAZARD_MISMATCH');
    expect(await incidents.findActiveByReportIds([reportId, secondId])).toBeNull();
  });

  it('rejects a batch containing an unverified member even when its first report is verified', async () => {
    const { reports, create, incidents } = context();
    reports.seedReport({ ...originalReport, id: secondId, status: 'PENDING' });
    expect((await create({ reportIds: [reportId, secondId] })).status).toBe(409);
    expect(await incidents.findActiveByReportIds([reportId])).toBeNull();
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)('denies %s access to create and read', async (role) => {
    const { app, create } = context();
    const saved = await create();
    expect((await request(app).post(base).auth(token(role), { type: 'bearer' }).send({ reportIds: [reportId] })).status).toBe(403);
    expect((await request(app).get(`${base}/${saved.body.incident.id}`).auth(token(role), { type: 'bearer' })).status).toBe(403);
  });

  it('requires authentication for create and read', async () => {
    const { app } = context();
    expect((await request(app).post(base).send({ reportIds: [reportId] })).status).toBe(401);
    expect((await request(app).get(`${base}/${reportId}`)).status).toBe(401);
    expect((await request(app).post(base).auth('invalid', { type: 'bearer' }).send({ reportIds: [reportId] })).status).toBe(401);
  });

  it.each(['createdById', 'status', 'hazardType', 'location', 'createdAt', 'updatedAt', 'description', 'role'])('rejects client-owned %s instead of trusting it', async (field) => {
    const { create, incidents } = context();
    const response = await create({ reportIds: [reportId], [field]: 'forged' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await incidents.findActiveByReportIds([reportId])).toBeNull();
  });

  it.each([
    {}, { reportIds: [] }, { reportIds: 'not-an-array' }, { reportIds: ['bad-id'] },
    { reportIds: [reportId, reportId] }, { reportIds: [reportId, reportId.toUpperCase()] },
    { reportIds: Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(24, '0')) }
  ])('rejects invalid or repeated references: %j', async (payload) => {
    expect((await context().create(payload)).status).toBe(400);
  });

  it('normalizes ObjectIds for report lookup and incident retrieval', async () => {
    const { create, get } = context();
    const response = await create({ reportIds: [reportId.toUpperCase()] });
    expect(response.status).toBe(201);
    expect(response.body.incident.reportIds).toEqual([reportId]);
    expect((await get(response.body.incident.id.toUpperCase())).body).toEqual(response.body);
  });

  it('returns 404 for missing reports/incidents and 400 for malformed incident IDs', async () => {
    const { create, get, incidents } = context();
    expect((await create({ reportIds: [reportId, secondId] })).status).toBe(404);
    expect(await incidents.findActiveByReportIds([reportId])).toBeNull();
    expect((await get(secondId)).status).toBe(404);
    expect((await get('invalid')).status).toBe(400);
  });

  it('prevents concurrent overlapping batches and later duplicate creation', async () => {
    const { reports, create, incidents } = context();
    reports.seedReport({ ...originalReport, id: secondId });
    reports.seedReport({ ...originalReport, id: thirdId });
    const responses = await Promise.all([
      create({ reportIds: [reportId, secondId] }),
      create({ reportIds: [secondId, thirdId] })
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe('ACTIVE_INCIDENT_EXISTS');
    const saved = responses.find((response) => response.status === 201)!.body.incident;
    expect(await incidents.findActiveByReportIds([secondId])).toEqual(saved);
    expect((await create({ reportIds: [secondId] })).status).toBe(409);
    const unclaimedId = saved.reportIds.includes(reportId) ? thirdId : reportId;
    expect((await create({ reportIds: [unclaimedId] })).status).toBe(201);
  });
});
