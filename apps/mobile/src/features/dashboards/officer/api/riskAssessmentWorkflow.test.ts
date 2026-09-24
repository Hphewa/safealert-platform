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
import { calculateRiskAssessment, createRiskAssessment, getRiskAssessment, getRiskAssessmentForReport, listVerifiedOfficerReports } from './riskAssessmentApi';
import { initialRiskAssessmentForm, parseRiskAssessmentForm } from '../riskAssessmentForm';

afterEach(() => vi.unstubAllGlobals());

it('runs verified report → mobile calculation → final decision → save → persisted result', async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const reports = new InMemoryReportRepository();
  const reportId = '123456789012345678901234';
  reports.seedReport({
    id: reportId, residentId: 'resident', hazardType: 'FLOOD', description: 'Water at the bridge.',
    severity: 'MODERATE', status: 'PENDING', location: { type: 'Point', coordinates: [79.86, 6.92] },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  const app = createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(), reportRepository: reports, riskAssessmentRepository: new InMemoryRiskAssessmentRepository() });
  const token = jwt.sign({ role: 'DISASTER_OFFICER' }, 'test-access-secret', { subject: 'officer', expiresIn: '15m' });
  // Transport adapter drives the real Express routes while exercising the real mobile API client.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method === 'POST' ? 'post' : 'get';
    const response = await request(app)[method](path)
      .set(Object.fromEntries(new Headers(options?.headers).entries()))
      .send(options?.body ? JSON.parse(String(options.body)) : undefined);
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  }));
  expect((await listVerifiedOfficerReports(token)).reports).toHaveLength(0);
  expect((await request(app).patch(`/api/v1/reports/${reportId}/verification`).auth(token, { type: 'bearer' }).send({ action: 'VERIFY' })).status).toBe(200);
  expect((await listVerifiedOfficerReports(token)).reports[0]?.id).toBe(reportId);
  expect((await getRiskAssessmentForReport(reportId, token)).assessment).toBeNull();
  const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm,
    hazardSeverity: 'HIGH', peopleAffected: '80', vulnerablePeople: '12',
    roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
  });
  const calculated = await calculateRiskAssessment({ hazardReportId: reportId, ...factors }, token);
  expect(calculated).toEqual({ calculatedScore: 23, systemSuggestedRisk: 'HIGH' });
  const saved = await createRiskAssessment({ hazardReportId: reportId, ...factors,
    finalRiskLevel: 'CRITICAL', decisionReason: 'Hospital access is threatened.'
  }, token);
  const result = await getRiskAssessment(saved.assessment.id, token);
  expect(result).toEqual(saved);
  expect(result.assessment).toMatchObject({ assessedById: 'officer', finalRiskLevel: 'CRITICAL', systemSuggestedRisk: 'HIGH', hazardReportId: reportId });
  expect((await getRiskAssessmentForReport(reportId, token)).assessment?.id).toBe(saved.assessment.id);
});
