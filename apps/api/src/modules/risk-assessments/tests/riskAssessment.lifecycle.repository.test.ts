import { describe, expect, it } from 'vitest';
import { InMemoryRiskAssessmentRepository } from '../repositories/inMemoryRiskAssessment.repository.js';
import type { CreateRiskAssessmentInput } from '../repositories/riskAssessment.repository.js';

const incidentId = '123456789012345678901234';
const officerId = '223456789012345678901234';
function input(overrides: Partial<CreateRiskAssessmentInput> = {}): CreateRiskAssessmentInput {
  return {
    incidentId, assessedById: officerId, hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
    roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING',
    weatherCondition: 'HEAVY_RAIN', calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH',
    status: 'ACTIVE', assessedAt: '2026-09-26T12:00:00.000Z', ...overrides
  };
}

describe('assessment lifecycle batch repository', () => {
  it('groups visible current/latest summaries and counts deleted-only history without returning it', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const emptyIncident = '323456789012345678901234';
    const deletedIncident = '423456789012345678901234';
    await repository.create(input({ status: 'ACTIVE' }));
    const deleted = await repository.create(input({ incidentId: deletedIncident, status: 'CLOSED', assessedAt: '2026-09-25T12:00:00.000Z' }));
    await repository.softDeleteClosedAssessment(deleted.id, {
      deletedAt: '2026-09-27T12:00:00.000Z', deletedById: officerId, deleteReason: 'DUPLICATE_RECORD'
    });

    const results = await repository.findLifecycleByIncidentIds([incidentId, emptyIncident, deletedIncident]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ incidentId, hasEverBeenAssessed: true,
        currentAssessment: expect.objectContaining({ status: 'ACTIVE' }),
        latestAssessment: expect.objectContaining({ status: 'ACTIVE' }) }),
      expect.objectContaining({ incidentId: emptyIncident, hasEverBeenAssessed: false,
        currentAssessment: null, latestAssessment: null }),
      expect.objectContaining({ incidentId: deletedIncident, hasEverBeenAssessed: true,
        currentAssessment: null, latestAssessment: null })
    ]));
    expect(JSON.stringify(results)).not.toContain('deleteReason');
  });
});
