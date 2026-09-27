import crypto from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RiskAssessmentModel, type RiskAssessmentDocument } from '../models/riskAssessment.model.js';
import { MongooseRiskAssessmentRepository } from '../repositories/mongooseRiskAssessment.repository.js';
import type { ReassessRiskAssessmentRecordInput } from '../repositories/riskAssessment.repository.js';

const mongodbUri = process.env.RISK_ASSESSMENT_TEST_MONGODB_URI;
describe.skipIf(!mongodbUri)('risk-assessment MongoDB reassessment transactions', () => {
  let connection: Connection;
  let model: typeof RiskAssessmentModel;
  let repository: MongooseRiskAssessmentRepository;
  const collectionName = `risk_assessment_reassess_test_${crypto.randomBytes(12).toString('hex')}`;

  beforeAll(async () => {
    connection = await mongoose.createConnection(mongodbUri!, { serverSelectionTimeoutMS: 5000 }).asPromise();
    model = connection.model<RiskAssessmentDocument>('RiskAssessment', RiskAssessmentModel.schema, collectionName);
    await model.init();
    repository = new MongooseRiskAssessmentRepository(model);
  });

  afterAll(async () => {
    try {
      if (model && connection.readyState === 1) await model.collection.drop();
    } finally {
      await connection?.close();
    }
  });

  function recordInput(overrides: Partial<ReassessRiskAssessmentRecordInput> = {}): ReassessRiskAssessmentRecordInput {
    return {
      incidentId: new mongoose.Types.ObjectId().toString(), assessedById: new mongoose.Types.ObjectId().toString(),
      hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2, roadAccessibility: 'ACCESSIBLE',
      infrastructureImpact: 'LOW', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
      calculatedScore: 18, systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH',
      assessedAt: '2026-09-26T12:30:00.000Z', reassessmentReason: 'Water levels are rising quickly.',
      ...overrides
    };
  }

  async function activeRecord(incidentId = new mongoose.Types.ObjectId().toString()) {
    return model.create({
      incidentId, assessedById: new mongoose.Types.ObjectId(), hazardSeverity: 'MODERATE',
      peopleAffected: 8, vulnerablePeople: 2, roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW',
      waterLevelTrend: 'STABLE', weatherCondition: 'CLEAR', calculatedScore: 12,
      systemSuggestedRisk: 'MODERATE', finalRiskLevel: 'MODERATE', status: 'ACTIVE',
      assessedAt: new Date('2026-09-26T12:00:00.000Z')
    });
  }

  async function closedRecord(incidentId = new mongoose.Types.ObjectId().toString()) {
    return model.create({
      incidentId, assessedById: new mongoose.Types.ObjectId(), hazardSeverity: 'MODERATE',
      peopleAffected: 8, vulnerablePeople: 2, roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW',
      waterLevelTrend: 'STABLE', weatherCondition: 'CLEAR', calculatedScore: 12,
      systemSuggestedRisk: 'MODERATE', finalRiskLevel: 'MODERATE', status: 'CLOSED',
      closureReason: 'INCIDENT_RESOLVED', closedAt: new Date('2026-09-26T12:30:00.000Z'),
      closedById: new mongoose.Types.ObjectId(), assessedAt: new Date('2026-09-26T12:00:00.000Z')
    });
  }

  const deleteInput = () => ({
    deletedAt: '2026-09-26T14:00:00.000Z',
    deletedById: new mongoose.Types.ObjectId().toString(), deleteReason: 'DUPLICATE_RECORD' as const
  });

  it('closes the old assessment and stores its active replacement and history link', async () => {
    const old = await activeRecord();

    const replacement = await repository.reassess(old._id.toString(), recordInput({
      incidentId: old.incidentId.toString()
    }));

    expect(await repository.findById(old._id.toString())).toMatchObject({
      status: 'CLOSED', closureReason: 'REASSESSED', closedById: expect.any(String), closedAt: expect.any(String)
    });
    expect(replacement).toMatchObject({
      status: 'ACTIVE', incidentId: old.incidentId.toString(), previousAssessmentId: old._id.toString(),
      reassessmentReason: 'Water levels are rising quickly.'
    });
    expect((await repository.findHistoryByIncidentId(old.incidentId.toString())).map(({ status }) => status))
      .toEqual(['ACTIVE', 'CLOSED']);
    expect(await model.countDocuments({ incidentId: old.incidentId, status: 'ACTIVE' })).toBe(1);
  });

  it('rolls back the old closure when replacement creation fails', async () => {
    const old = await activeRecord();
    const invalidRecord = recordInput({
      incidentId: old.incidentId.toString(), reassessmentReason: 'short'
    });

    await expect(repository.reassess(old._id.toString(), invalidRecord)).rejects.toThrow();

    expect(await repository.findById(old._id.toString())).toMatchObject({ status: 'ACTIVE' });
    expect(await model.countDocuments({ incidentId: old.incidentId })).toBe(1);
  });

  it('allows only one concurrent reassessment and rejects a stale retry', async () => {
    const old = await activeRecord();
    const input = recordInput({ incidentId: old.incidentId.toString() });

    const results = await Promise.allSettled([
      repository.reassess(old._id.toString(), input), repository.reassess(old._id.toString(), input)
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await model.countDocuments({ incidentId: old.incidentId, status: 'ACTIVE' })).toBe(1);
  });

  it('closes an ACTIVE assessment and preserves its audit fields in history', async () => {
    const active = await activeRecord();
    const closure = {
      closureReason: 'OTHER' as const, closureNote: 'The hazard has been contained.',
      closedAt: '2026-09-26T13:00:00.000Z', closedById: new mongoose.Types.ObjectId().toString()
    };

    const closed = await repository.closeActiveAssessment(active._id.toString(), closure);

    expect(closed).toMatchObject({
      id: active._id.toString(), status: 'CLOSED', closureReason: 'OTHER',
      closureNote: closure.closureNote, closedAt: closure.closedAt, closedById: closure.closedById
    });
    expect(await repository.findById(active._id.toString())).toEqual(closed);
    expect(await repository.closeActiveAssessment(active._id.toString(), closure)).toBeNull();
    expect((await repository.findHistoryByIncidentId(active.incidentId.toString())).map(({ id }) => id))
      .toEqual([active._id.toString()]);
    expect(await model.countDocuments({ incidentId: active.incidentId, status: 'ACTIVE' })).toBe(0);
  });

  it('allows only one concurrent close of the same assessment', async () => {
    const active = await activeRecord();
    const closure = {
      closureReason: 'INCIDENT_RESOLVED' as const,
      closedAt: '2026-09-26T13:00:00.000Z', closedById: new mongoose.Types.ObjectId().toString()
    };
    const results = await Promise.all([
      repository.closeActiveAssessment(active._id.toString(), closure),
      repository.closeActiveAssessment(active._id.toString(), closure)
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await model.countDocuments({ incidentId: active.incidentId, status: 'ACTIVE' })).toBe(0);
    expect(await model.countDocuments({ incidentId: active.incidentId })).toBe(1);
  });

  it('arbitrates close and reassess attempts without producing two ACTIVE assessments', async () => {
    const active = await activeRecord();
    const closure = {
      closureReason: 'MONITORING_COMPLETED' as const,
      closedAt: '2026-09-26T13:00:00.000Z', closedById: new mongoose.Types.ObjectId().toString()
    };
    const results = await Promise.allSettled([
      repository.closeActiveAssessment(active._id.toString(), closure),
      repository.reassess(active._id.toString(), recordInput({ incidentId: active.incidentId.toString() }))
    ]);
    const close = results[0];
    const reassess = results[1];

    if (close.status === 'fulfilled' && close.value) {
      expect(reassess.status).toBe('rejected');
      expect(await model.countDocuments({ incidentId: active.incidentId, status: 'ACTIVE' })).toBe(0);
    } else {
      expect(close).toEqual({ status: 'fulfilled', value: null });
      expect(reassess.status).toBe('fulfilled');
      expect(await model.countDocuments({ incidentId: active.incidentId, status: 'ACTIVE' })).toBe(1);
    }
    expect(await repository.findById(active._id.toString())).toMatchObject({ status: 'CLOSED' });
  });

  it('atomically soft deletes a CLOSED document and keeps it stored while filtering normal reads', async () => {
    const closed = await closedRecord();

    const result = await repository.softDeleteClosedAssessment(closed._id.toString(), deleteInput());

    expect(result).toMatchObject({ kind: 'deleted', assessment: {
      id: closed._id.toString(), status: 'CLOSED', isDeleted: true,
      deletedById: expect.any(String), deletedAt: '2026-09-26T14:00:00.000Z', deleteReason: 'DUPLICATE_RECORD'
    } });
    expect(await model.collection.countDocuments({ _id: closed._id })).toBe(1);
    expect(await repository.findById(closed._id.toString())).toBeNull();
    expect(await repository.findHistoryByIncidentId(closed.incidentId.toString())).toEqual([]);
  });

  it('treats legacy documents without isDeleted as visible', async () => {
    const legacy = await activeRecord();
    await model.collection.updateOne({ _id: legacy._id }, { $unset: { isDeleted: '' } });

    expect(await repository.findById(legacy._id.toString())).toMatchObject({ id: legacy._id.toString(), isDeleted: false });
    expect(await repository.findActiveByIncidentId(legacy.incidentId.toString())).toMatchObject({ id: legacy._id.toString() });
    expect(await repository.findHistoryByIncidentId(legacy.incidentId.toString())).toHaveLength(1);
  });

  it('rejects ACTIVE and VOID states and distinguishes missing and duplicate deletes', async () => {
    const active = await activeRecord();
    const voided = await model.create({
      ...(await activeRecord()).toObject(), _id: new mongoose.Types.ObjectId(), status: 'VOID'
    });
    const closed = await closedRecord();

    await expect(repository.softDeleteClosedAssessment(active._id.toString(), deleteInput())).resolves.toEqual({ kind: 'not_closed' });
    await expect(repository.softDeleteClosedAssessment(voided._id.toString(), deleteInput())).resolves.toEqual({ kind: 'not_closed' });
    await expect(repository.softDeleteClosedAssessment('999999999999999999999999', deleteInput())).resolves.toEqual({ kind: 'not_found' });
    await expect(repository.softDeleteClosedAssessment(closed._id.toString(), deleteInput())).resolves.toMatchObject({ kind: 'deleted' });
    await expect(repository.softDeleteClosedAssessment(closed._id.toString(), deleteInput())).resolves.toEqual({ kind: 'already_deleted' });
  });

  it('allows one concurrent delete and preserves reassessment linkage', async () => {
    const old = await activeRecord();
    const replacement = await repository.reassess(old._id.toString(), recordInput({
      incidentId: old.incidentId.toString()
    }));

    const results = await Promise.all([
      repository.softDeleteClosedAssessment(old._id.toString(), deleteInput()),
      repository.softDeleteClosedAssessment(old._id.toString(), deleteInput())
    ]);

    expect(results.map(({ kind }) => kind).sort()).toEqual(['already_deleted', 'deleted']);
    expect(await model.collection.countDocuments({ _id: old._id })).toBe(1);
    expect(await repository.findById(replacement.id)).toMatchObject({ previousAssessmentId: old._id.toString(), status: 'ACTIVE' });
    expect(await repository.findActiveByIncidentId(old.incidentId.toString())).toMatchObject({ id: replacement.id });
    expect((await repository.findHistoryByIncidentId(old.incidentId.toString())).map(({ id }) => id)).toEqual([replacement.id]);
  });
});
