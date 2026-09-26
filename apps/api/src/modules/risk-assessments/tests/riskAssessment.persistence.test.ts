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
});
