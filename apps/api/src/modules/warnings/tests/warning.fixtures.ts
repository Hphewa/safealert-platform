import jwt from 'jsonwebtoken';
import type { RiskLevel, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../risk-assessments/repositories/inMemoryRiskAssessment.repository.js';
import { InMemoryWarningRepository } from '../repositories/inMemoryWarning.repository.js';
import { InMemoryIncidentRepository } from '../../incidents/repositories/inMemoryIncident.repository.js';

export const officerId = '123456789012345678901235';
export const warningInput = {
  affectedArea: 'Riverside village', requiredAction: 'Move to the community hall.',
  unsafeRoads: 'River Road bridge', safeRoutes: 'Hill Road', message: 'Flood water is rising near homes.',
  attachments: []
};
export function warningToken(role: UserRole = 'DISASTER_OFFICER') {
  return jwt.sign({ role }, 'test-access-secret', { subject: officerId, expiresIn: '15m' });
}
export async function warningContext(finalRiskLevel: RiskLevel = 'HIGH') {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const reports = new InMemoryReportRepository();
  const assessments = new InMemoryRiskAssessmentRepository();
  const incidents = new InMemoryIncidentRepository();
  const warnings = new InMemoryWarningRepository();
  const reportId = '123456789012345678901234';
  reports.seedReport({
    id: reportId, residentId: '123456789012345678901236', hazardType: 'FLOOD', severity: 'LOW',
    description: 'Water near the bridge.', status: 'VERIFIED', location: { type: 'Point', coordinates: [79.86, 6.92] },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  await incidents.create({ hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, reportIds: [reportId], status: 'ACTIVE', createdById: officerId });
  const incidentId = (await incidents.findActiveByReportIds([reportId]))!.id;
  const assessment = await assessments.create({
    incidentId, assessedById: '123456789012345678901237', hazardSeverity: 'HIGH',
    peopleAffected: 80, vulnerablePeople: 12, roadAccessibility: 'PARTIALLY_BLOCKED',
    infrastructureImpact: 'MODERATE', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
    calculatedScore: 23, systemSuggestedRisk: 'HIGH', finalRiskLevel, decisionReason: 'Officer final decision.',
    status: 'ACTIVE', assessedAt: new Date().toISOString()
  });
  const app = createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(),
    reportRepository: reports, incidentRepository: incidents, riskAssessmentRepository: assessments, warningRepository: warnings });
  return { app, assessments, assessment, warnings, reportId, payload: { assessmentId: assessment.id, ...warningInput } };
}
