import { describe, expect, it } from 'vitest';
import { InMemoryRiskAssessmentRepository } from '../repositories/inMemoryRiskAssessment.repository.js';
import type { CreateRiskAssessmentInput } from '../repositories/riskAssessment.repository.js';

const incidentId = '123456789012345678901234';
const otherIncidentId = '223456789012345678901234';

function input(overrides: Partial<CreateRiskAssessmentInput> = {}): CreateRiskAssessmentInput {
  return {
    incidentId,
    hazardSeverity: 'HIGH',
    peopleAffected: 8,
    vulnerablePeople: 2,
    roadAccessibility: 'ACCESSIBLE',
    infrastructureImpact: 'LOW',
    waterLevelTrend: 'RISING',
    weatherCondition: 'HEAVY_RAIN',
    finalRiskLevel: 'HIGH',
    calculatedScore: 18,
    systemSuggestedRisk: 'HIGH',
    assessedById: '323456789012345678901234',
    status: 'ACTIVE',
    assessedAt: '2026-09-26T12:00:00.000Z',
    ...overrides
  };
}

describe('in-memory risk-assessment history repository', () => {
  it('returns only the requested incident assessments in assessedAt and ID descending order across statuses', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const active = await repository.create(input({ status: 'ACTIVE', assessedAt: '2026-09-26T12:00:00.000Z' }));
    const closed = await repository.create(input({ status: 'CLOSED', assessedAt: '2026-09-26T12:00:00.000Z' }));
    const voided = await repository.create(input({ status: 'VOID', assessedAt: '2026-09-25T12:00:00.000Z' }));
    await repository.create(input({ incidentId: otherIncidentId, status: 'ACTIVE' }));

    const history = await repository.findHistoryByIncidentId(incidentId);

    expect(history.map(({ status }) => status).sort()).toEqual(['ACTIVE', 'CLOSED', 'VOID']);
    expect(history.map(({ assessedAt }) => assessedAt)).toEqual([
      '2026-09-26T12:00:00.000Z', '2026-09-26T12:00:00.000Z', '2026-09-25T12:00:00.000Z'
    ]);
    expect(history.every(({ incidentId: returnedIncidentId }) => returnedIncidentId === incidentId)).toBe(true);
    const expected = [active, closed, voided].sort((left, right) =>
      right.assessedAt.localeCompare(left.assessedAt) || right.id.localeCompare(left.id)
    );
    expect(history.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
  });

  it('returns an empty array when an incident has no assessments', async () => {
    const repository = new InMemoryRiskAssessmentRepository();

    await expect(repository.findHistoryByIncidentId(incidentId)).resolves.toEqual([]);
  });
});
