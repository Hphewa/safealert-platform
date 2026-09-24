import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryRiskAssessmentRepository } from '../repositories/inMemoryRiskAssessment.repository.js';

const reportId = '123456789012345678901234';
const officerId = '123456789012345678901235';
const missingId = '123456789012345678901299';
const factors = {
  hazardReportId: reportId, hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
  roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
  waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
};
const payload = { ...factors, finalRiskLevel: 'HIGH' };
const report: SafeReport = {
  id: reportId, residentId: '123456789012345678901236', status: 'VERIFIED',
  hazardType: 'FLOOD', severity: 'LOW', description: 'Water near the bridge.',
  location: { type: 'Point', coordinates: [79.86, 6.92] },
  createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z'
};
const base = '/api/v1/risk-assessments';
function token(role: UserRole = 'DISASTER_OFFICER') {
  return jwt.sign({ role }, 'test-access-secret', { subject: officerId, expiresIn: '15m' });
}
function context() {
  const reportRepository = new InMemoryReportRepository();
  reportRepository.seedReport(report);
  const riskAssessmentRepository = new InMemoryRiskAssessmentRepository();
  const app = createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(), reportRepository, riskAssessmentRepository });
  const post = (body: object = payload, path = base) => request(app).post(path).auth(token(), { type: 'bearer' }).send(body);
  const get = (path: string) => request(app).get(path).auth(token(), { type: 'bearer' });
  return { app, post, get, reportRepository, riskAssessmentRepository };
}
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('risk assessment API', () => {
  const protectedRoutes = [
    ['post', `${base}/calculate`], ['post', base], ['get', `${base}/${reportId}`],
    ['get', `${base}/report/${reportId}`], ['get', '/api/v1/reports/officer/verified']
  ] as const;
  it.each(protectedRoutes)('requires authentication for %s %s', async (method, path) => {
    const { app } = context();
    expect((await request(app)[method](path).send(factors)).status).toBe(401);
  });
  for (const role of ['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const) {
    it.each(protectedRoutes)(`${role} cannot access %s %s`, async (method, path) => {
      const { app } = context();
      expect((await request(app)[method](path).auth(token(role), { type: 'bearer' }).send(factors)).status).toBe(403);
    });
  }
  it('calculates without persisting and independently of resident severity', async () => {
    const { post, riskAssessmentRepository } = context();
    const response = await post(factors, `${base}/calculate`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ calculatedScore: 23, systemSuggestedRisk: 'HIGH' });
    expect(await riskAssessmentRepository.findActiveByHazardReportId(reportId)).toBeNull();
  });
  it.each(['PENDING', 'REJECTED', 'RESOLVED'] as const)('rejects create and calculate for %s', async (status) => {
    const { post, reportRepository } = context();
    reportRepository.seedReport({ ...report, status });
    for (const [path, body] of [[base, payload], [`${base}/calculate`, factors]] as const) {
      const response = await post(body, path);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_REPORT_STATE');
    }
  });
  it('creates and retrieves the correct report relationship and authenticated officer', async () => {
    const { post, get, riskAssessmentRepository } = context();
    const response = await post();
    expect(response.status).toBe(201);
    expect(response.body.assessment).toMatchObject({
      ...payload, assessedById: officerId, calculatedScore: 23, systemSuggestedRisk: 'HIGH',
      status: 'ACTIVE', assessedAt: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String)
    });
    expect(response.body.report).toEqual(report);
    expect(await riskAssessmentRepository.findById(response.body.assessment.id)).toEqual(response.body.assessment);
    const fetched = await get(`${base}/${response.body.assessment.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(response.body);
    expect((await get(`${base}/report/${reportId}`)).body).toEqual(response.body);
    for (const field of ['residentId', 'location', 'description', 'hazardType']) {
      expect(response.body.assessment).not.toHaveProperty(field);
    }
  });
  it.each(['assessedById', 'assessedBy', 'calculatedScore', 'systemSuggestedRisk', 'createdAt', 'updatedAt', 'assessedAt', 'status', 'role', 'hazardType', 'reportStatus'])('rejects forged %s on both endpoints', async (key) => {
    const { post } = context();
    for (const [path, body] of [[base, payload], [`${base}/calculate`, factors]] as const) {
      const response = await post({ ...body, [key]: 'forged' }, path);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it.each([
    { hazardSeverity: 'CRITICAL' }, { roadAccessibility: 'LIMITED' }, { infrastructureImpact: 'INVALID' },
    { waterLevelTrend: 'INVALID' }, { weatherCondition: 'INVALID' }, { finalRiskLevel: 'SEVERE' },
    { peopleAffected: -1 }, { peopleAffected: 1.5 }, { peopleAffected: '80' },
    { peopleAffected: Number.MAX_SAFE_INTEGER + 1 }, { vulnerablePeople: -1 },
    { vulnerablePeople: 81 }, { vulnerablePeople: 1.2 }, { vulnerablePeople: '12' },
    { hazardReportId: 'not-an-id' }, { decisionReason: 'short' },
    { decisionReason: '          ' }, { decisionReason: 'x'.repeat(501) }
  ])('rejects invalid input %j', async (invalid) => {
    expect((await context().post({ ...payload, ...invalid })).status).toBe(400);
  });
  it('requires an override reason and accepts a trimmed meaningful reason', async () => {
    const { post } = context();
    const invalid = await post({ ...payload, finalRiskLevel: 'CRITICAL' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('DECISION_REASON_REQUIRED');
    const valid = await post({ ...payload, finalRiskLevel: 'CRITICAL', decisionReason: '  Hospital access is threatened.  ' });
    expect(valid.status).toBe(201);
    expect(valid.body.assessment).toMatchObject({ finalRiskLevel: 'CRITICAL', systemSuggestedRisk: 'HIGH', decisionReason: 'Hospital access is threatened.' });
  });
  it('prevents sequential and concurrent duplicate ACTIVE assessments', async () => {
    const { post } = context();
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const duplicate = await post();
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ACTIVE_ASSESSMENT_EXISTS');
  });
  it('returns consistent missing-resource and malformed-ID errors', async () => {
    const { post, get } = context();
    expect((await post({ ...payload, hazardReportId: missingId })).status).toBe(404);
    expect((await post({ ...factors, hazardReportId: missingId }, `${base}/calculate`)).status).toBe(404);
    expect((await get(`${base}/${missingId}`)).status).toBe(404);
    expect((await get(`${base}/report/${missingId}`)).status).toBe(404);
    expect((await get(`${base}/invalid`)).status).toBe(400);
    expect((await get(`${base}/report/invalid`)).status).toBe(400);
    expect((await get(`${base}/report/${reportId}`)).body).toEqual({ report, assessment: null });
  });
  it('lists verified reports only', async () => {
    const { get, reportRepository } = context();
    for (const [index, status] of (['PENDING', 'REJECTED', 'RESOLVED'] as const).entries()) {
      reportRepository.seedReport({ ...report, id: `22345678901234567890123${index}`, status });
    }
    const response = await get('/api/v1/reports/officer/verified');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reports: [report] });
  });
  it('checks current status at save and preserves reads after resolution', async () => {
    const { post, get, reportRepository } = context();
    await post(factors, `${base}/calculate`);
    reportRepository.seedReport({ ...report, status: 'RESOLVED' });
    expect((await post()).status).toBe(409);
    reportRepository.seedReport(report);
    const created = await post();
    reportRepository.seedReport({ ...report, status: 'RESOLVED' });
    expect((await get(`${base}/${created.body.assessment.id}`)).status).toBe(200);
  });
});
