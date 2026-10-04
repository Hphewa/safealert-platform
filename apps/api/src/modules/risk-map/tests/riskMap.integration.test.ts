import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { USER_ROLES } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { assessment, repositories, incidentId, officerId, addWarning } from './riskMap.fixtures.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';

const base = '/api/v1/risk-map';
const common = ['incidentId', 'hazardType', 'location', 'riskLevel', 'assessedAt', 'hasPublishedWarning'];
function token(role: string, expiresIn = 900) { return jwt.sign({ role }, 'risk-map-test-secret', { subject: officerId, expiresIn }); }
beforeEach(() => {
  process.env.NODE_ENV = 'test'; process.env.JWT_ACCESS_SECRET = 'risk-map-test-secret'; process.env.JWT_REFRESH_SECRET = 'risk-map-refresh-secret';
});
async function context() {
  const repos = repositories();
  const current = await repos.assessments.create(assessment());
  await addWarning(repos.warnings, current.id, 'PUBLISHED');
  const reports = new InMemoryReportRepository();
  reports.seedReport({ id: '333333333333333333333331', residentId: '444444444444444444444444', hazardType: 'FLOOD',
    location: { type: 'Point', coordinates: [79.86, 6.92] }, description: 'Private report evidence', severity: 'LOW',
    mediaReference: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.png',
    status: 'VERIFIED', createdAt: current.assessedAt, updatedAt: current.assessedAt, verifiedById: officerId, verifiedAt: current.assessedAt });
  return { ...repos, current, app: createApp({ config: loadConfig(), incidentRepository: repos.incidents,
    riskAssessmentRepository: repos.assessments, warningRepository: repos.warnings, reportRepository: reports }) };
}
describe('Risk Map HTTP authorization and serialization', () => {
  it.each(USER_ROLES)('returns the exact %s field allowlist', async role => {
    const { app } = await context();
    const response = await request(app).get(base).auth(token(role), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.role).toBe(role);
    const extra = role === 'DISASTER_OFFICER' ? ['incidentStatus', 'reportCount', 'assessmentId', 'assessmentStatus', 'calculatedScore']
      : role === 'EMERGENCY_RESPONDER' ? ['incidentStatus', 'reportCount'] : [];
    expect(Object.keys(response.body.incidents[0]).sort()).toEqual([...common, ...extra].sort());
    expect(response.text).not.toMatch(/residentId|reporterId|createdById|publishedById|decisionReason|overrideReason|evidence|closureReason|deleteReason|deletedById|Targeted|Private/);
    expect(response.body.incidents[0].hasPublishedWarning).toBe(true);
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it.each([undefined, 'invalid-token', token('RESIDENT', -1)])('rejects missing, malformed or expired authentication', async value => {
    const { app } = await context();
    const req = request(app).get(base);
    if (value) req.auth(value, { type: 'bearer' });
    expect((await req).status).toBe(401);
  });
  it('rejects unsupported roles', async () => {
    const { app } = await context();
    expect((await request(app).get(base).auth(token('ADMIN'), { type: 'bearer' })).status).toBe(403);
  });

  it.each(USER_ROLES)('returns %s detail with a role-specific allowlist and verified images', async role => {
    const { app } = await context();
    const response = await request(app).get(`${base}/${incidentId}`).auth(token(role), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.role).toBe(role);
    expect(response.headers['cache-control']).toContain('no-store');
    const detail = response.body.detail;
    expect(detail).toMatchObject({ incidentId, riskLevel: 'HIGH', hasPublishedWarning: true,
      riskFactors: { roadAccessibility: 'ACCESSIBLE' },
      evidence: [{ type: 'IMAGE', imageUrl: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.png' }] });
    if (role === 'DISASTER_OFFICER') expect(detail).toMatchObject({ assessmentId: expect.any(String), riskFactors: { hazardSeverity: 'HIGH', peopleAffected: 8 } });
    if (role === 'EMERGENCY_RESPONDER') expect(detail).toMatchObject({ incidentStatus: 'ACTIVE', reportCount: 4, riskFactors: { hazardSeverity: 'HIGH', peopleAffected: 8 } });
    if (role === 'COMMUNITY_VOLUNTEER') {
      expect(detail).not.toHaveProperty('reportCount'); expect(detail.riskFactors).not.toHaveProperty('vulnerablePeople');
    }
    if (role === 'RESIDENT') {
      expect(Object.keys(detail).sort()).toEqual(['assessedAt', 'evidence', 'hasPublishedWarning', 'hazardType', 'incidentId', 'location', 'riskFactors', 'riskLevel'].sort());
      expect(detail.riskFactors).not.toHaveProperty('peopleAffected');
    }
    expect(response.text).not.toMatch(/residentId|verifiedById|officerId|decisionReason|description|Private|Targeted|publishedById|rejectionReason/);
  });

  it('rejects malformed and unavailable risk location IDs without leaking resources', async () => {
    const { app } = await context();
    const auth = token('RESIDENT');
    expect((await request(app).get(`${base}/not-an-id`).auth(auth, { type: 'bearer' })).status).toBe(400);
    expect((await request(app).get(`${base}/999999999999999999999999`).auth(auth, { type: 'bearer' })).status).toBe(404);
  });
  it.each(['role=DISASTER_OFFICER', 'riskLevel=HIGH', 'includeDeleted=true'])('rejects unsupported query: %s', async query => {
    const { app } = await context();
    expect((await request(app).get(`${base}?${query}`).auth(token('RESIDENT'), { type: 'bearer' })).status).toBe(400);
  });
  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'])('keeps officer reads protected from %s', async role => {
    const { app } = await context();
    for (const path of ['/api/v1/incidents/active', '/api/v1/incidents/monitoring', `/api/v1/risk-assessments/incident/${incidentId}`]) {
      expect((await request(app).get(path).auth(token(role), { type: 'bearer' })).status).toBe(403);
    }
  });
  it('reflects the real reassess and close endpoints without changing incident status', async () => {
    const { app, current, incidents } = await context();
    const { hazardSeverity, peopleAffected, vulnerablePeople, roadAccessibility, infrastructureImpact, waterLevelTrend, weatherCondition } = assessment();
    const reassess = await request(app).post(`/api/v1/risk-assessments/${current.id}/reassess`).auth(token('DISASTER_OFFICER'), { type: 'bearer' })
      .send({ hazardSeverity, peopleAffected, vulnerablePeople, roadAccessibility, infrastructureImpact, waterLevelTrend, weatherCondition,
        finalRiskLevel: 'CRITICAL', decisionReason: 'New flood threat requires escalation.', reassessmentReason: 'New evidence has changed the risk.' });
    expect(reassess.status).toBe(201);
    const mapped = await request(app).get(base).auth(token('RESIDENT'), { type: 'bearer' });
    expect(mapped.body.incidents).toEqual([expect.objectContaining({ incidentId, riskLevel: 'CRITICAL', hasPublishedWarning: false })]);
    const currentDetail = (await request(app).get(`${base}/${incidentId}`).auth(token('RESIDENT'), { type: 'bearer' })).body.detail;
    expect(currentDetail).toMatchObject({ riskLevel: 'CRITICAL', riskFactors: { waterLevelTrend: 'RISING' } });
    expect(currentDetail.riskFactors).not.toHaveProperty('peopleAffected');
    const close = await request(app).patch(`/api/v1/risk-assessments/${reassess.body.assessment.id}/close`)
      .auth(token('DISASTER_OFFICER'), { type: 'bearer' }).send({ closureReason: 'MONITORING_COMPLETED' });
    expect(close.status).toBe(200);
    expect((await request(app).get(base).auth(token('RESIDENT'), { type: 'bearer' })).body.incidents).toEqual([]);
    expect((await request(app).get(`${base}/${incidentId}`).auth(token('RESIDENT'), { type: 'bearer' })).status).toBe(404);
    expect((await incidents.findById(incidentId))?.status).toBe('ACTIVE');
  });
});
