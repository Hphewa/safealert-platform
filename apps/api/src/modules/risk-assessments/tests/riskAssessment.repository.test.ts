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

describe('in-memory risk-assessment manual close repository', () => {
  it('closes an ACTIVE assessment with its audit fields and keeps it in history', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const active = await repository.create(input());
    const other = await repository.create(input({ incidentId: otherIncidentId }));
    const closed = await repository.closeActiveAssessment(active.id, {
      closureReason: 'OTHER', closureNote: 'The incident has been resolved.',
      closedAt: '2026-09-26T13:00:00.000Z', closedById: '423456789012345678901234'
    });

    expect(closed).toMatchObject({
      id: active.id, status: 'CLOSED', closureReason: 'OTHER',
      closureNote: 'The incident has been resolved.', closedAt: '2026-09-26T13:00:00.000Z',
      closedById: '423456789012345678901234', updatedAt: expect.any(String)
    });
    expect(await repository.findById(active.id)).toEqual(closed);
    expect(await repository.findActiveByIncidentId(incidentId)).toBeNull();
    expect(await repository.findById(other.id)).toEqual(other);
    expect((await repository.findHistoryByIncidentId(incidentId)).map(({ id }) => id)).toEqual([active.id]);
  });

  it('accepts a predefined reason without a note and leaves CLOSED or VOID records unchanged', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const active = await repository.create(input());
    const voided = await repository.create(input({ status: 'VOID' }));
    const closure = { closureReason: 'INCIDENT_RESOLVED' as const,
      closedAt: '2026-09-26T13:00:00.000Z', closedById: '423456789012345678901234' };
    const closed = await repository.closeActiveAssessment(active.id, closure);

    expect(closed).toMatchObject({ status: 'CLOSED', closureReason: 'INCIDENT_RESOLVED' });
    expect(closed).not.toHaveProperty('closureNote');
    await expect(repository.closeActiveAssessment(active.id, closure)).resolves.toBeNull();
    await expect(repository.closeActiveAssessment(voided.id, closure)).resolves.toBeNull();
    await expect(repository.closeActiveAssessment('999999999999999999999999', closure)).resolves.toBeNull();
    expect(await repository.findById(active.id)).toEqual(closed);
    expect(await repository.findById(voided.id)).toEqual(voided);
  });

  it('allows only one concurrent close of the same ACTIVE assessment', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const active = await repository.create(input());
    const closure = { closureReason: 'MONITORING_COMPLETED' as const,
      closedAt: '2026-09-26T13:00:00.000Z', closedById: '423456789012345678901234' };
    const results = await Promise.all([
      repository.closeActiveAssessment(active.id, closure),
      repository.closeActiveAssessment(active.id, closure)
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.findHistoryByIncidentId(incidentId)).filter(({ status }) => status === 'ACTIVE')).toHaveLength(0);
    expect(await repository.findHistoryByIncidentId(incidentId)).toHaveLength(1);
  });
});

describe('in-memory risk-assessment soft delete repository', () => {
  const deleteInput = {
    deletedAt: '2026-09-26T14:00:00.000Z',
    deletedById: '523456789012345678901234',
    deleteReason: 'CREATED_BY_MISTAKE' as const
  };

  it('soft deletes a CLOSED assessment with audit fields and removes it from normal reads', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const closed = await repository.create(input({ status: 'CLOSED' }));

    const result = await repository.softDeleteClosedAssessment(closed.id, deleteInput);

    expect(result).toMatchObject({
      kind: 'deleted', assessment: {
        id: closed.id, status: 'CLOSED', isDeleted: true,
        deletedAt: deleteInput.deletedAt, deletedById: deleteInput.deletedById,
        deleteReason: deleteInput.deleteReason
      }
    });
    expect(await repository.findById(closed.id)).toBeNull();
    expect(await repository.findHistoryByIncidentId(incidentId)).toEqual([]);
  });

  it.each(['ACTIVE', 'VOID'] as const)('refuses to delete %s assessments', async (status) => {
    const repository = new InMemoryRiskAssessmentRepository();
    const assessment = await repository.create(input({ status }));

    await expect(repository.softDeleteClosedAssessment(assessment.id, deleteInput))
      .resolves.toEqual({ kind: 'not_closed' });
    expect(await repository.findById(assessment.id)).toMatchObject({ status, isDeleted: false });
  });

  it('distinguishes a missing record and a duplicate delete', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const closed = await repository.create(input({ status: 'CLOSED' }));

    await expect(repository.softDeleteClosedAssessment('999999999999999999999999', deleteInput))
      .resolves.toEqual({ kind: 'not_found' });
    await expect(repository.softDeleteClosedAssessment(closed.id, deleteInput))
      .resolves.toMatchObject({ kind: 'deleted' });
    await expect(repository.softDeleteClosedAssessment(closed.id, deleteInput))
      .resolves.toEqual({ kind: 'already_deleted' });
  });

  it('allows only one simultaneous delete transition', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const closed = await repository.create(input({ status: 'CLOSED' }));

    const results = await Promise.all([
      repository.softDeleteClosedAssessment(closed.id, deleteInput),
      repository.softDeleteClosedAssessment(closed.id, { ...deleteInput, deleteReason: 'DUPLICATE_RECORD' })
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(['already_deleted', 'deleted']);
    expect(await repository.findHistoryByIncidentId(incidentId)).toEqual([]);
  });

  it('keeps the ACTIVE reassessment and its predecessor reference when deleting the predecessor', async () => {
    const repository = new InMemoryRiskAssessmentRepository();
    const previous = await repository.create(input());
    const current = await repository.reassess(previous.id, reassessmentInput());

    await expect(repository.softDeleteClosedAssessment(previous.id, deleteInput))
      .resolves.toMatchObject({ kind: 'deleted' });

    expect(await repository.findActiveByIncidentId(incidentId)).toMatchObject({ id: current.id, status: 'ACTIVE' });
    expect(await repository.findHistoryByIncidentId(incidentId)).toHaveLength(1);
    expect(await repository.findHistoryByIncidentId(incidentId)).toMatchObject([{ id: current.id, previousAssessmentId: previous.id }]);
  });
});
