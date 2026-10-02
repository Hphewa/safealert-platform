import type { SafeIncident } from '@safealert/contracts';
import { InMemoryIncidentRepository } from '../../incidents/repositories/inMemoryIncident.repository.js';
import { InMemoryRiskAssessmentRepository } from '../../risk-assessments/repositories/inMemoryRiskAssessment.repository.js';
import { InMemoryWarningRepository } from '../../warnings/repositories/inMemoryWarning.repository.js';
import type { CreateRiskAssessmentInput } from '../../risk-assessments/repositories/riskAssessment.repository.js';

export const incidentId = '111111111111111111111111';
export const officerId = '222222222222222222222222';
export function incident(overrides: Partial<SafeIncident> = {}): SafeIncident {
  return { id: incidentId, hazardType: 'FLOOD', status: 'ACTIVE',
    location: { type: 'Point', coordinates: [79.86, 6.92] },
    reportIds: ['333333333333333333333331', '333333333333333333333332', '333333333333333333333333', '333333333333333333333334'],
    createdById: officerId, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', ...overrides };
}
export function assessment(overrides: Partial<CreateRiskAssessmentInput> = {}): CreateRiskAssessmentInput {
  return { incidentId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
    calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', status: 'ACTIVE',
    assessedAt: '2026-10-01T11:00:00.000Z', decisionReason: 'Internal officer decision reason.', ...overrides };
}
export function repositories() {
  const incidents = new InMemoryIncidentRepository();
  incidents.seedIncident(incident());
  return { incidents, assessments: new InMemoryRiskAssessmentRepository(), warnings: new InMemoryWarningRepository() };
}
export async function addWarning(warnings: InMemoryWarningRepository, assessmentId: string, status: 'DRAFT' | 'PUBLISHED') {
  return warnings.create({ assessmentId, status, hazardReportId: '333333333333333333333331', createdById: officerId,
    riskLevel: 'HIGH', affectedArea: 'Targeted area', requiredAction: 'Private audience guidance',
    unsafeRoads: 'Audience road', message: 'Targeted warning message',
    ...(status === 'PUBLISHED' ? { publishedAt: '2026-10-01T12:00:00.000Z', publishedById: officerId } : {}) });
}
