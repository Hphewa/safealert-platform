import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RiskAssessmentStatus, SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryRiskAssessmentRepository } from '../repositories/inMemoryRiskAssessment.repository.js';
import type { CreateRiskAssessmentInput } from '../repositories/riskAssessment.repository.js';
import { InMemoryIncidentRepository } from '../../incidents/repositories/inMemoryIncident.repository.js';

const reportId = '123456789012345678901234';
const incidentId = '123456789012345678901240';
const officerId = '123456789012345678901235';
const missingId = '123456789012345678901299';
const factors = {
  incidentId, hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
  roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
  waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
};
const payload = { ...factors, finalRiskLevel: 'HIGH' };
function savedAssessment(status: RiskAssessmentStatus, assessedAt: string): CreateRiskAssessmentInput {
  return {
    incidentId, hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
    roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
    waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
    calculatedScore: 23, systemSuggestedRisk: 'HIGH', assessedById: officerId, status, assessedAt
  };
}
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
  const incidentRepository = new InMemoryIncidentRepository();
  incidentRepository.seedIncident({ id: incidentId, hazardType: 'FLOOD', location: report.location, reportIds: [reportId], status: 'ACTIVE', createdById: officerId, createdAt: report.createdAt, updatedAt: report.updatedAt });
  const riskAssessmentRepository = new InMemoryRiskAssessmentRepository();
  const app = createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(), reportRepository, incidentRepository, riskAssessmentRepository });
  const post = (body: object = payload, path = base) => request(app).post(path).auth(token(), { type: 'bearer' }).send(body);
  const close = (assessmentId: string, body: object = { closureReason: 'INCIDENT_RESOLVED' }) =>
    request(app).patch(`${base}/${assessmentId}/close`).auth(token(), { type: 'bearer' }).send(body);
  const softDelete = (assessmentId: string, body: object = { deleteReason: 'CREATED_BY_MISTAKE' }) =>
    request(app).patch(`${base}/${assessmentId}/delete`).auth(token(), { type: 'bearer' }).send(body);
  const get = (path: string) => request(app).get(path).auth(token(), { type: 'bearer' });
  return { app, post, close, softDelete, get, reportRepository, riskAssessmentRepository, incidentRepository };
}
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('risk assessment API', () => {
  const protectedRoutes = [
    ['post', `${base}/calculate`], ['post', base], ['post', `${base}/${reportId}/reassess`],
    ['patch', `${base}/${reportId}/close`], ['patch', `${base}/${reportId}/delete`], ['get', `${base}/${reportId}`],
    ['get', `${base}/incident/${incidentId}`], ['get', `${base}/incident/${incidentId}/history`],
    ['get', '/api/v1/reports/officer/verified']
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
    expect(response.body).toMatchObject({ calculatedScore: 23, systemSuggestedRisk: 'HIGH',
      calculationVersion: 'risk-v1', factorContributions: expect.any(Array) });
    expect(response.body.factorContributions.reduce((sum: number, entry: { points: number }) => sum + entry.points, 0))
      .toBe(response.body.calculatedScore);
    expect(await riskAssessmentRepository.findActiveByIncidentId(incidentId)).toBeNull();
  });
  it.each(['PENDING', 'REJECTED', 'CANCELLED', 'RESOLVED'] as const)('rejects create and calculate for %s', async (status) => {
    const { post, reportRepository } = context();
    reportRepository.seedReport({ ...report, status });
    for (const [path, body] of [[base, payload], [`${base}/calculate`, factors]] as const) {
      const response = await post(body, path);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_INCIDENT_STATE');
    }
  });
  it('rejects assessment when the incident is not active or has no verified evidence', async () => {
    const { post, incidentRepository, reportRepository } = context();
    incidentRepository.seedIncident({ id: incidentId, hazardType: 'FLOOD', location: report.location, reportIds: [reportId], status: 'CLOSED', createdById: officerId, createdAt: report.createdAt, updatedAt: report.updatedAt });
    expect((await post(payload)).body.error.code).toBe('INCIDENT_NOT_ACTIVE');
    incidentRepository.seedIncident({ id: incidentId, hazardType: 'FLOOD', location: report.location, reportIds: [reportId], status: 'ACTIVE', createdById: officerId, createdAt: report.createdAt, updatedAt: report.updatedAt });
    reportRepository.seedReport({ ...report, status: 'PENDING' });
    expect((await post(payload)).body.error.code).toBe('INVALID_INCIDENT_STATE');
  });
  it('creates and retrieves the correct incident relationship and authenticated officer', async () => {
    const { post, get, riskAssessmentRepository } = context();
    const response = await post();
    expect(response.status).toBe(201);
    expect(response.body.assessment).toMatchObject({
      ...payload, assessedById: officerId, calculatedScore: 23, systemSuggestedRisk: 'HIGH',
      status: 'ACTIVE', assessedAt: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String)
    });
    expect(response.body.assessment).toMatchObject({ calculationVersion: 'risk-v1', factorContributions: expect.any(Array) });
    expect(response.body.incident).toMatchObject({ id: incidentId, reportIds: [reportId], hazardType: 'FLOOD' });
    expect(await riskAssessmentRepository.findById(response.body.assessment.id)).toEqual(response.body.assessment);
    const fetched = await get(`${base}/${response.body.assessment.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(response.body);
    expect((await get(`${base}/incident/${incidentId}`)).body).toEqual(response.body);
    for (const field of ['residentId', 'location', 'description', 'hazardType']) {
      expect(response.body.assessment).not.toHaveProperty(field);
    }
  });
  it('atomically reassesses with server-calculated risk, authenticated identity, linkage, and history', async () => {
    const { post, get, riskAssessmentRepository } = context();
    const original = await post();
    const factorsForReassessment = {
      hazardSeverity: 'SEVERE', peopleAffected: 90, vulnerablePeople: 20,
      roadAccessibility: 'FULLY_BLOCKED', infrastructureImpact: 'SEVERE',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'STORM',
    };
    const preview = await post({ incidentId, ...factorsForReassessment }, `${base}/calculate`);
    const reassessment = {
      ...factorsForReassessment, finalRiskLevel: preview.body.systemSuggestedRisk,
      reassessmentReason: 'Flood levels are rising rapidly.'
    };

    const response = await post(reassessment, `${base}/${original.body.assessment.id}/reassess`);

    expect(preview.status).toBe(200);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      incident: { id: incidentId }, reports: [report],
      assessment: {
        ...reassessment, incidentId, status: 'ACTIVE', assessedById: officerId,
        previousAssessmentId: original.body.assessment.id,
        calculatedScore: preview.body.calculatedScore,
        systemSuggestedRisk: preview.body.systemSuggestedRisk,
        calculationVersion: 'risk-v1', factorContributions: preview.body.factorContributions
      }
    });
    expect(await riskAssessmentRepository.findById(original.body.assessment.id)).toMatchObject({
      status: 'CLOSED', closureReason: 'REASSESSED', closedById: officerId, closedAt: expect.any(String)
    });
    const history = await get(`${base}/incident/${incidentId}/history`);
    expect(history.body.assessments.map((assessment: { id: string; status: string }) => [assessment.id, assessment.status]))
      .toEqual([[response.body.assessment.id, 'ACTIVE'], [original.body.assessment.id, 'CLOSED']]);
  });
  it('rejects reassessment when the source is missing or already closed', async () => {
    const { post } = context();
    const validRequest = {
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    };
    expect((await post(validRequest, `${base}/${missingId}/reassess`)).status).toBe(404);
    const original = await post();
    const path = `${base}/${original.body.assessment.id}/reassess`;
    expect((await post({ ...validRequest, reassessmentReason: '' }, path)).status).toBe(400);
    expect((await post(validRequest, path)).status).toBe(201);
    const stale = await post({ ...validRequest, reassessmentReason: 'A stale second reassessment.' }, path);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
  });
  it('rejects reassessment from a VOID assessment', async () => {
    const { post, riskAssessmentRepository } = context();
    const voided = await riskAssessmentRepository.create(savedAssessment('VOID', '2026-09-26T12:00:00.000Z'));
    const response = await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/${voided.id}/reassess`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
  });
  it('requires current incident eligibility and preserves the active assessment when it fails', async () => {
    const { post, riskAssessmentRepository, incidentRepository } = context();
    const original = await post();
    incidentRepository.seedIncident({
      id: incidentId, hazardType: 'FLOOD', location: report.location, reportIds: [reportId], status: 'CLOSED',
      createdById: officerId, createdAt: report.createdAt, updatedAt: report.updatedAt
    });
    const response = await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/${original.body.assessment.id}/reassess`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INCIDENT_NOT_ACTIVE');
    expect(await riskAssessmentRepository.findById(original.body.assessment.id)).toMatchObject({ status: 'ACTIVE' });
  });
  it('preserves the active assessment when its verified reports lose eligibility', async () => {
    const { post, riskAssessmentRepository, reportRepository } = context();
    const original = await post();
    reportRepository.seedReport({ ...report, status: 'PENDING' });

    const response = await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/${original.body.assessment.id}/reassess`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_INCIDENT_STATE');
    expect(await riskAssessmentRepository.findById(original.body.assessment.id)).toMatchObject({ status: 'ACTIVE' });
    expect(await riskAssessmentRepository.findHistoryByIncidentId(incidentId)).toHaveLength(1);
  });
  it('maps concurrent reassessment attempts to one success and one conflict', async () => {
    const { post, riskAssessmentRepository } = context();
    const original = await post();
    const path = `${base}/${original.body.assessment.id}/reassess`;
    const body = {
      hazardSeverity: 'SEVERE', peopleAffected: 90, vulnerablePeople: 20,
      roadAccessibility: 'FULLY_BLOCKED', infrastructureImpact: 'SEVERE',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'STORM', finalRiskLevel: 'CRITICAL',
      reassessmentReason: 'Conditions have changed substantially.'
    };

    const responses = await Promise.all([post(body, path), post(body, path)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
    expect(await riskAssessmentRepository.findHistoryByIncidentId(incidentId)).toHaveLength(2);
    expect((await riskAssessmentRepository.findHistoryByIncidentId(incidentId)).filter(({ status }) => status === 'ACTIVE'))
      .toHaveLength(1);
  });
  it('closes an active assessment with server audit fields and keeps it in history', async () => {
    const { post, close, get, riskAssessmentRepository, incidentRepository, reportRepository } = context();
    const original = await post();
    const assessmentId = original.body.assessment.id;
    incidentRepository.seedIncident({
      id: incidentId, hazardType: 'FLOOD', location: report.location, reportIds: [reportId], status: 'CLOSED',
      createdById: officerId, createdAt: report.createdAt, updatedAt: report.updatedAt
    });
    reportRepository.seedReport({ ...report, status: 'RESOLVED' });
    const before = Date.now();
    const response = await close(assessmentId, {
      closureReason: 'OTHER', closureNote: '  Water has receded after local inspection.  '
    });
    const after = Date.now();

    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(['assessment']);
    expect(response.body.assessment).toMatchObject({
      id: assessmentId, status: 'CLOSED', closureReason: 'OTHER',
      closureNote: 'Water has receded after local inspection.', closedById: officerId,
      closedAt: expect.any(String)
    });
    expect(Date.parse(response.body.assessment.closedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(response.body.assessment.closedAt)).toBeLessThanOrEqual(after);
    expect(await riskAssessmentRepository.findById(assessmentId)).toEqual(response.body.assessment);
    expect((await get(`${base}/incident/${incidentId}/history`)).body.assessments)
      .toEqual([response.body.assessment]);
  });
  it('returns not found for a missing assessment and conflict for a closed or void assessment', async () => {
    const { post, close, riskAssessmentRepository } = context();
    const missing = await close(missingId);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ASSESSMENT_NOT_FOUND');
    const original = await post();
    expect((await close(original.body.assessment.id)).status).toBe(200);
    const repeated = await close(original.body.assessment.id);
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
    const voided = await riskAssessmentRepository.create(savedAssessment('VOID', '2026-09-26T12:00:00.000Z'));
    const voidResponse = await close(voided.id);
    expect(voidResponse.status).toBe(409);
    expect(voidResponse.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
  });
  it('rejects forged close fields, REASSESSED, malformed IDs, and invalid OTHER notes', async () => {
    const { post, close, riskAssessmentRepository } = context();
    const original = await post();
    const id = original.body.assessment.id;
    for (const body of [
      { closureReason: 'REASSESSED' }, { closureReason: 'OTHER' },
      { closureReason: 'OTHER', closureNote: '   ' },
      { closureReason: 'INCIDENT_RESOLVED', status: 'CLOSED' },
      { closureReason: 'INCIDENT_RESOLVED', closedById: missingId },
      { closureReason: 'INCIDENT_RESOLVED', closedAt: '2020-01-01T00:00:00.000Z' },
      { closureReason: 'INCIDENT_RESOLVED', incidentId },
      { closureReason: 'INCIDENT_RESOLVED', previousAssessmentId: missingId }
    ]) {
      const response = await close(id, body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await close('invalid')).status).toBe(400);
    expect(await riskAssessmentRepository.findById(id)).toMatchObject({ status: 'ACTIVE' });
  });
  it('maps concurrent close attempts to one success and one conflict', async () => {
    const { post, close, riskAssessmentRepository } = context();
    const original = await post();
    const id = original.body.assessment.id;
    const responses = await Promise.all([close(id), close(id)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error.code).toBe('ASSESSMENT_NOT_ACTIVE');
    expect(await riskAssessmentRepository.findHistoryByIncidentId(incidentId)).toHaveLength(1);
  });
  it('preserves REASSESSED closure metadata when a successor is closed manually', async () => {
    const { post, close, riskAssessmentRepository } = context();
    const original = await post();
    const reassessed = await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/${original.body.assessment.id}/reassess`);
    expect(reassessed.status).toBe(201);
    expect((await close(reassessed.body.assessment.id)).status).toBe(200);
    expect(await riskAssessmentRepository.findById(original.body.assessment.id)).toMatchObject({
      status: 'CLOSED', closureReason: 'REASSESSED', closedById: officerId
    });
  });
  it('requires a decision reason for a final-risk override and rejects forged server fields', async () => {
    const { post, riskAssessmentRepository } = context();
    const original = await post();
    const path = `${base}/${original.body.assessment.id}/reassess`;
    const requestBody = {
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
      reassessmentReason: 'Conditions have changed substantially.'
    };
    const override = await post({ ...requestBody, finalRiskLevel: 'LOW' }, path);
    expect(override.status).toBe(400);
    expect(override.body.error.code).toBe('DECISION_REASON_REQUIRED');
    for (const field of ['calculatedScore', 'systemSuggestedRisk', 'assessedById', 'status', 'closedAt', 'closedById']) {
      expect((await post({ ...requestBody, finalRiskLevel: 'HIGH', [field]: 'forged' }, path)).status).toBe(400);
    }
    expect(await riskAssessmentRepository.findById(original.body.assessment.id)).toMatchObject({ status: 'ACTIVE' });
  });
  it('returns all assessment statuses for a closed incident newest first', async () => {
    const { get, riskAssessmentRepository, incidentRepository, reportRepository } = context();
    incidentRepository.seedIncident({ id: incidentId, hazardType: 'FLOOD', location: report.location,
      reportIds: [reportId], status: 'CLOSED', createdById: officerId,
      createdAt: report.createdAt, updatedAt: report.updatedAt });
    reportRepository.seedReport({ ...report, status: 'RESOLVED' });
    await riskAssessmentRepository.create(savedAssessment('ACTIVE', '2026-09-26T12:00:00.000Z'));
    await riskAssessmentRepository.create(savedAssessment('CLOSED', '2026-09-27T12:00:00.000Z'));
    await riskAssessmentRepository.create(savedAssessment('VOID', '2026-09-25T12:00:00.000Z'));

    const response = await get(`${base}/incident/${incidentId}/history`);

    expect(response.status).toBe(200);
    expect(response.body.incidentId).toBe(incidentId);
    expect(response.body.assessments.map((assessment: { status: RiskAssessmentStatus }) => assessment.status))
      .toEqual(['CLOSED', 'ACTIVE', 'VOID']);
    expect(response.body.assessments.map((assessment: { assessedAt: string }) => assessment.assessedAt)).toEqual([
      '2026-09-27T12:00:00.000Z', '2026-09-26T12:00:00.000Z', '2026-09-25T12:00:00.000Z'
    ]);
  });
  it('returns an empty assessment collection for a valid incident without history', async () => {
    const { get } = context();

    const response = await get(`${base}/incident/${incidentId}/history`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ incidentId, assessments: [] });
  });
  it('soft deletes a CLOSED assessment, preserves audit data, and hides it from normal reads', async () => {
    const { post, close, softDelete, get, riskAssessmentRepository } = context();
    const created = await post();
    const assessmentId = created.body.assessment.id as string;
    expect((await close(assessmentId)).status).toBe(200);

    const deleted = await softDelete(assessmentId, {
      deleteReason: 'OTHER', deleteNote: '  Created against the wrong incident.  '
    });

    expect(deleted.status).toBe(200);
    expect(deleted.body.assessment).toMatchObject({
      id: assessmentId, status: 'CLOSED', isDeleted: true, deletedById: officerId,
      deleteReason: 'OTHER', deleteNote: 'Created against the wrong incident.',
      deletedAt: expect.any(String)
    });
    expect(await riskAssessmentRepository.findById(assessmentId)).toBeNull();
    expect((await get(`${base}/${assessmentId}`)).status).toBe(404);
    expect((await get(`${base}/incident/${incidentId}/history`)).body.assessments).toEqual([]);
    expect((await get(`${base}/incident/${incidentId}`)).body.assessment).toBeNull();
  });
  it('rejects invalid, forged, missing, and ineligible deletion requests', async () => {
    const { post, softDelete } = context();
    const active = await post();
    expect((await softDelete(active.body.assessment.id)).status).toBe(409);
    expect((await softDelete('invalid')).status).toBe(400);
    expect((await softDelete(missingId)).status).toBe(404);

    const ineligibleContext = context();
    const voided = await ineligibleContext.riskAssessmentRepository.create(
      savedAssessment('VOID', '2026-09-26T12:00:00.000Z')
    );
    expect((await ineligibleContext.softDelete(voided.id)).status).toBe(409);

    const closedContext = context();
    const created = await closedContext.post();
    const assessmentId = created.body.assessment.id as string;
    expect((await closedContext.close(assessmentId)).status).toBe(200);

    for (const body of [
      { deleteReason: 'OTHER' }, { deleteReason: 'OTHER', deleteNote: '   ' },
      { deleteReason: 'CREATED_BY_MISTAKE', isDeleted: true },
      { deleteReason: 'CREATED_BY_MISTAKE', deletedAt: new Date().toISOString() },
      { deleteReason: 'CREATED_BY_MISTAKE', deletedById: officerId },
      { deleteReason: 'CREATED_BY_MISTAKE', status: 'CLOSED' }
    ]) {
      expect((await closedContext.softDelete(assessmentId, body)).status).toBe(400);
    }
  });
  it('returns conflict for a repeated or concurrent delete', async () => {
    const { post, close, softDelete } = context();
    const created = await post();
    const assessmentId = created.body.assessment.id as string;
    await close(assessmentId);

    const responses = await Promise.all([softDelete(assessmentId), softDelete(assessmentId)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.error.code).toBe('ASSESSMENT_ALREADY_DELETED');
    const repeat = await softDelete(assessmentId);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('ASSESSMENT_ALREADY_DELETED');
  });
  it('hides a deleted predecessor while keeping its ACTIVE reassessment linked and current', async () => {
    const { post, softDelete, get } = context();
    const original = await post();
    const previousId = original.body.assessment.id as string;
    const replacement = await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/${previousId}/reassess`);
    expect(replacement.status).toBe(201);

    expect((await softDelete(previousId)).status).toBe(200);

    expect((await get(`${base}/incident/${incidentId}`)).body.assessment)
      .toMatchObject({ id: replacement.body.assessment.id, status: 'ACTIVE' });
    expect((await get(`${base}/incident/${incidentId}/history`)).body.assessments)
      .toMatchObject([{ id: replacement.body.assessment.id, previousAssessmentId: previousId }]);
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
    { incidentId: 'not-an-id' }, { decisionReason: 'short' },
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
    expect((await post({ ...payload, incidentId: missingId })).status).toBe(404);
    expect((await post({ ...factors, incidentId: missingId }, `${base}/calculate`)).status).toBe(404);
    expect((await get(`${base}/${missingId}`)).status).toBe(404);
    expect((await get(`${base}/incident/${missingId}`)).status).toBe(404);
    expect((await get(`${base}/incident/${missingId}/history`)).status).toBe(404);
    expect((await get(`${base}/invalid`)).status).toBe(400);
    expect((await get(`${base}/incident/invalid`)).status).toBe(400);
    expect((await get(`${base}/incident/invalid/history`)).status).toBe(400);
    expect((await post({
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH',
      reassessmentReason: 'Conditions have changed substantially.'
    }, `${base}/invalid/reassess`)).status).toBe(400);
    expect((await get(`${base}/incident/${incidentId}`)).body).toMatchObject({ incident: expect.objectContaining({ id: incidentId }), assessment: null, reports: [report] });
  });
  it('lists verified reports only', async () => {
    const { get, reportRepository } = context();
    for (const [index, status] of (['PENDING', 'REJECTED', 'CANCELLED', 'RESOLVED'] as const).entries()) {
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


