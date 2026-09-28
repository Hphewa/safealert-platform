import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
// Include the API's request augmentation only in this cross-workspace integration test.
import type {} from '../../../../../../api/src/types/express.js';
import { createApp } from '../../../../../../api/src/app.js';
import { loadConfig } from '../../../../../../api/src/config/env.js';
import { InMemoryAuthRepository } from '../../../../../../api/src/modules/auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../../../../../api/src/modules/reports/repositories/inMemoryReport.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../../../../../api/src/modules/risk-assessments/repositories/inMemoryRiskAssessment.repository.js';
import { InMemoryIncidentRepository } from '../../../../../../api/src/modules/incidents/repositories/inMemoryIncident.repository.js';
import {
  calculateRiskAssessment, closeRiskAssessment, createRiskAssessment, getRiskAssessment, getRiskAssessmentForIncident,
  getRiskAssessmentHistory, listVerifiedOfficerReports, reassessRiskAssessment
} from './riskAssessmentApi';
import { buildCloseRiskAssessmentRequest, initialRiskAssessmentForm, parseRiskAssessmentForm } from '../riskAssessmentForm';

afterEach(() => vi.unstubAllGlobals());

it('runs verified report → assessment → reassessment → manual close through the mobile API', async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const reports = new InMemoryReportRepository();
  const reportId = '123456789012345678901234';
  reports.seedReport({
    id: reportId, residentId: 'resident', hazardType: 'FLOOD', description: 'Water at the bridge.',
    severity: 'MODERATE', status: 'PENDING', location: { type: 'Point', coordinates: [79.86, 6.92] },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  const incidents = new InMemoryIncidentRepository();
  incidents.seedIncident({ id: '123456789012345678901240', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, reportIds: [reportId], status: 'ACTIVE', createdById: 'officer', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const app = createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(), reportRepository: reports, incidentRepository: incidents, riskAssessmentRepository: new InMemoryRiskAssessmentRepository() });
  const token = jwt.sign({ role: 'DISASTER_OFFICER' }, 'test-access-secret', { subject: 'officer', expiresIn: '15m' });
  // Transport adapter drives the real Express routes while exercising the real mobile API client.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method === 'POST' ? 'post' : options?.method === 'PATCH' ? 'patch' : 'get';
    const response = await request(app)[method](path)
      .set(Object.fromEntries(new Headers(options?.headers).entries()))
      .send(options?.body ? JSON.parse(String(options.body)) : undefined);
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  }));
  expect((await listVerifiedOfficerReports(token)).reports).toHaveLength(0);
  expect((await request(app).patch(`/api/v1/reports/${reportId}/verification`).auth(token, { type: 'bearer' }).send({ action: 'VERIFY' })).status).toBe(200);
  expect((await listVerifiedOfficerReports(token)).reports[0]?.id).toBe(reportId);
  const incidentId = '123456789012345678901240';
  expect((await getRiskAssessmentForIncident(incidentId, token)).assessment).toBeNull();
  const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm,
    hazardSeverity: 'HIGH', peopleAffected: '80', vulnerablePeople: '12',
    roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
  });
  const calculated = await calculateRiskAssessment({ incidentId, ...factors }, token);
  expect(calculated).toEqual({ calculatedScore: 23, systemSuggestedRisk: 'HIGH' });
  const saved = await createRiskAssessment({ incidentId, ...factors,
    finalRiskLevel: 'CRITICAL', decisionReason: 'Hospital access is threatened.'
  }, token);
  const result = await getRiskAssessment(saved.assessment.id, token);
  expect(result).toEqual(saved);
  expect(result.assessment).toMatchObject({ assessedById: 'officer', finalRiskLevel: 'CRITICAL', systemSuggestedRisk: 'HIGH', incidentId });
  expect((await getRiskAssessmentForIncident(incidentId, token)).assessment?.id).toBe(saved.assessment.id);

  const reassessed = await reassessRiskAssessment(saved.assessment.id, {
    hazardSeverity: factors.hazardSeverity, peopleAffected: factors.peopleAffected,
    vulnerablePeople: factors.vulnerablePeople, roadAccessibility: factors.roadAccessibility,
    infrastructureImpact: factors.infrastructureImpact, waterLevelTrend: factors.waterLevelTrend,
    weatherCondition: factors.weatherCondition, finalRiskLevel: 'HIGH',
    reassessmentReason: 'Water levels are rising quickly.'
  }, token);
  expect(reassessed.assessment).toMatchObject({
    status: 'ACTIVE', assessedById: 'officer', previousAssessmentId: saved.assessment.id,
    reassessmentReason: 'Water levels are rising quickly.'
  });
  expect((await getRiskAssessment(saved.assessment.id, token)).assessment)
    .toMatchObject({ status: 'CLOSED', closureReason: 'REASSESSED', closedById: 'officer' });
  expect((await getRiskAssessmentHistory(incidentId, token)).assessments.map(({ id, status }) => [id, status]))
    .toEqual([[reassessed.assessment.id, 'ACTIVE'], [saved.assessment.id, 'CLOSED']]);

  const closed = await closeRiskAssessment(reassessed.assessment.id, buildCloseRiskAssessmentRequest(
    'OTHER', '  Hazard cleared after inspection.  '
  ), token);
  expect(closed.assessment).toMatchObject({
    id: reassessed.assessment.id, status: 'CLOSED', closureReason: 'OTHER',
    closureNote: 'Hazard cleared after inspection.', closedById: 'officer'
  });
  expect((await getRiskAssessmentForIncident(incidentId, token)).assessment).toBeNull();
  expect((await getRiskAssessmentHistory(incidentId, token)).assessments.map(({ id, status }) => [id, status]))
    .toEqual([[reassessed.assessment.id, 'CLOSED'], [saved.assessment.id, 'CLOSED']]);
});
