import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../risk-assessments/repositories/inMemoryRiskAssessment.repository.js';
import { InMemoryWarningRepository } from '../../warnings/repositories/inMemoryWarning.repository.js';

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
  const assessments = new InMemoryRiskAssessmentRepository();
  const warnings = new InMemoryWarningRepository();
  const app = createApp({ config: loadConfig(), reportRepository: reports, incidentRepository: incidents,
    riskAssessmentRepository: assessments, warningRepository: warnings });
  const create = (body: object = { reportIds: [reportId] }) =>
    request(app).post(base).auth(token(), { type: 'bearer' }).send(body);
  const get = (id: string) => request(app).get(`${base}/${id}`).auth(token(), { type: 'bearer' });
  return { app, reports, incidents, assessments, warnings, create, get };
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('incident API', () => {
  it('serves incident activity from the officer-only timeline route', async () => {
    const { app, create } = context();
    const saved = await create();
    const path = `${base}/${saved.body.incident.id}/timeline`;
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).auth(token('RESIDENT'), { type: 'bearer' })).status).toBe(403);
    const response = await request(app).get(path).auth(token(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.incidentId).toBe(saved.body.incident.id);
    expect(response.body.events.map(({ type }: { type: string }) => type).sort()).toEqual([
      'INCIDENT_CREATED', 'REPORT_CREATED', 'REPORT_VERIFIED'
    ].sort());
    expect(response.body.events.map(({ timestamp }: { timestamp: string }) => Date.parse(timestamp)))
      .toEqual([...response.body.events.map(({ timestamp }: { timestamp: string }) => Date.parse(timestamp))]
        .sort((left, right) => right - left));
    expect((await request(app).get(`${base}/abcdef123456789012345699/timeline`).auth(token(), { type: 'bearer' }))
      .body.error.code).toBe('INCIDENT_NOT_FOUND');
  });

  it('serves officer-only lifecycle queue and monitoring endpoints with validated detail IDs', async () => {
    const { app, create } = context();
    expect((await request(app).get(`${base}/assessment-queue`)).status).toBe(401);
    expect((await request(app).get(`${base}/monitoring`).auth(token('RESIDENT'), { type: 'bearer' })).status).toBe(403);
    const saved = await create();
    const queue = await request(app).get(`${base}/assessment-queue`).auth(token(), { type: 'bearer' });
    expect(queue.status).toBe(200);
    expect(queue.body).toMatchObject({ incidents: [{ incident: { id: saved.body.incident.id }, reports: [{ id: reportId }] }] });
    expect((await request(app).get(`${base}/monitoring`).auth(token(), { type: 'bearer' })).body).toEqual({ incidents: [] });
    expect((await request(app).get(`${base}/monitoring/not-an-id`).auth(token(), { type: 'bearer' })).status).toBe(400);
  });

  it('keeps an assessed incident in Monitoring through close and soft delete without exposing deleted details', async () => {
    const { app, create, assessments } = context();
    const saved = await create();
    const incidentId = saved.body.incident.id as string;
    const active = await assessments.create({
      incidentId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
      roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING',
      weatherCondition: 'HEAVY_RAIN', calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH',
      status: 'ACTIVE', assessedAt: '2026-09-26T12:00:00.000Z'
    });
    expect((await request(app).get(`${base}/assessment-queue`).auth(token(), { type: 'bearer' })).body.incidents).toEqual([]);
    expect((await request(app).get(`${base}/monitoring/${incidentId}`).auth(token(), { type: 'bearer' })).body.monitoring)
      .toMatchObject({ currentAssessment: { id: active.id, status: 'ACTIVE' }, newVerifiedReportsSinceAssessment: 0 });

    await assessments.closeActiveAssessment(active.id, {
      closureReason: 'INCIDENT_RESOLVED', closedAt: '2026-09-26T13:00:00.000Z', closedById: officerId
    });
    expect((await request(app).get(`${base}/monitoring`).auth(token(), { type: 'bearer' })).body.incidents[0])
      .toMatchObject({ currentAssessment: null, latestAssessment: { id: active.id, status: 'CLOSED' } });
    await assessments.softDeleteClosedAssessment(active.id, {
      deletedAt: '2026-09-26T14:00:00.000Z', deletedById: officerId, deleteReason: 'CREATED_BY_MISTAKE'
    });
    const detail = await request(app).get(`${base}/monitoring/${incidentId}`).auth(token(), { type: 'bearer' });
    expect(detail.body.monitoring).toMatchObject({ incident: { id: incidentId }, currentAssessment: null, latestAssessment: null });
    expect(JSON.stringify(detail.body)).not.toMatch(/isDeleted|deletedAt|deletedById|deleteReason/);
    expect((await request(app).get(`${base}/assessment-queue`).auth(token(), { type: 'bearer' })).body.incidents).toEqual([]);
  });

  it('returns RESOLVED and CLOSED assessed incidents from the Monitoring endpoint', async () => {
    const { app, incidents, assessments } = context();
    const resolvedId = '523456789012345678901234';
    const closedId = '623456789012345678901234';
    incidents.seedIncident({
      id: resolvedId, hazardType: 'FLOOD', location: originalReport.location, reportIds: [], status: 'RESOLVED',
      createdById: officerId, createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z'
    });
    incidents.seedIncident({
      id: closedId, hazardType: 'FLOOD', location: originalReport.location, reportIds: [], status: 'CLOSED',
      createdById: officerId, createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z'
    });
    await assessments.create({
      incidentId: resolvedId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
      roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
      calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', status: 'ACTIVE', assessedAt: '2026-09-26T12:00:00.000Z'
    });
    await assessments.create({
      incidentId: closedId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
      roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
      calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', status: 'CLOSED', assessedAt: '2026-09-26T12:00:00.000Z'
    });
    const response = await request(app).get(`${base}/monitoring`).auth(token(), { type: 'bearer' });
    expect(response.body.incidents.map(({ incident: row }: { incident: { id: string; status: string } }) => [row.id, row.status]))
      .toEqual([[closedId, 'CLOSED'], [resolvedId, 'RESOLVED']]);
  });
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
