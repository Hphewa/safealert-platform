import { describe, expect, it } from 'vitest';
import { InMemoryRiskAssessmentRepository } from '../repositories/inMemoryRiskAssessment.repository.js';
import {
  RiskAssessmentReassessmentConflictError,
  type CreateRiskAssessmentInput,
  type ReassessRiskAssessmentRecordInput
} from '../repositories/riskAssessment.repository.js';

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

function reassessmentInput(overrides: Partial<ReassessRiskAssessmentRecordInput> = {}): ReassessRiskAssessmentRecordInput {
  const { status, ...activeInput } = input();
  if (status !== 'ACTIVE') throw new Error('A reassessment replacement starts ACTIVE.');
  return {
    ...activeInput,
    assessedAt: '2026-09-26T12:30:00.000Z',
    reassessmentReason: 'Water levels are rising quickly.',
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

describe('in-memory risk-assessment reassessment repository', () => {
  it('closes the active assessment and inserts a linked active assessment atomically', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const previous = await repository.create(input());

    const reassessed = await repository.reassess(previous.id, reassessmentInput());

    expect(await repository.findById(previous.id)).toMatchObject({
      status: 'CLOSED', closureReason: 'REASSESSED', closedById: '323456789012345678901234',
      closedAt: expect.any(String), updatedAt: expect.any(String)
    });
    expect(reassessed).toMatchObject({
      incidentId, status: 'ACTIVE', previousAssessmentId: previous.id,
      reassessmentReason: 'Water levels are rising quickly.'
    });
    expect(await repository.findActiveByIncidentId(incidentId)).toMatchObject({ id: reassessed.id });
    expect((await repository.findHistoryByIncidentId(incidentId)).map(({ id }) => id)).toEqual([reassessed.id, previous.id]);
  });

  it('rejects stale reassessment attempts without changing the first transition', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const previous = await repository.create(input());
    const first = await repository.reassess(previous.id, reassessmentInput());

    await expect(repository.reassess(previous.id, reassessmentInput())).rejects.toBeInstanceOf(RiskAssessmentReassessmentConflictError);

    expect(await repository.findById(previous.id)).toMatchObject({ status: 'CLOSED', closureReason: 'REASSESSED' });
    expect(await repository.findActiveByIncidentId(incidentId)).toMatchObject({ id: first.id });
    expect((await repository.findHistoryByIncidentId(incidentId))).toHaveLength(2);
  });

  it('allows only one concurrent reassessment of the same active assessment', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const previous = await repository.create(input());

    const results = await Promise.allSettled([
      repository.reassess(previous.id, reassessmentInput()),
      repository.reassess(previous.id, reassessmentInput())
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect((await repository.findHistoryByIncidentId(incidentId)).filter(({ status }) => status === 'ACTIVE')).toHaveLength(1);
  });

  it('leaves the active assessment unchanged when reassessment input does not match its incident', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const previous = await repository.create(input());

    await expect(repository.reassess(previous.id, reassessmentInput({ incidentId: otherIncidentId })))
      .rejects.toBeInstanceOf(RiskAssessmentReassessmentConflictError);

    expect(await repository.findById(previous.id)).toMatchObject({ status: 'ACTIVE' });
    expect(await repository.findHistoryByIncidentId(incidentId)).toHaveLength(1);
  });
});
