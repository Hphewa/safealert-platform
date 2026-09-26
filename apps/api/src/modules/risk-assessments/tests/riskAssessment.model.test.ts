import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RiskAssessmentModel, toSafeRiskAssessment } from '../models/riskAssessment.model.js';
import { MongooseRiskAssessmentRepository } from '../repositories/mongooseRiskAssessment.repository.js';
import { ActiveRiskAssessmentExistsError } from '../repositories/riskAssessment.repository.js';

function document() {
  return new RiskAssessmentModel({
    incidentId: new mongoose.Types.ObjectId(), assessedById: new mongoose.Types.ObjectId(),
    hazardSeverity: 'LOW', peopleAffected: 1, vulnerablePeople: 0, roadAccessibility: 'ACCESSIBLE',
    infrastructureImpact: 'NONE', waterLevelTrend: 'STABLE', weatherCondition: 'CLEAR',
    calculatedScore: 1, systemSuggestedRisk: 'LOW', finalRiskLevel: 'LOW',
    createdAt: new Date(), updatedAt: new Date()
  });
}
afterEach(() => vi.restoreAllMocks());
describe('risk persistence constraints', () => {
  it('defines a partial unique ACTIVE index and incident/user references', () => {
    expect(RiskAssessmentModel.schema.indexes()).toContainEqual([
      { incidentId: 1, status: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { status: 'ACTIVE' } })
    ]);
    expect(RiskAssessmentModel.schema.path('incidentId').options.ref).toBe('Incident');
    expect(RiskAssessmentModel.schema.path('assessedById').options.ref).toBe('User');
  });
  it('validates and serializes dates and references safely', async () => {
    const assessment = document();
    await expect(assessment.validate()).resolves.toBeUndefined();
    expect(toSafeRiskAssessment(assessment)).toMatchObject({ status: 'ACTIVE', assessedAt: expect.any(String), incidentId: assessment.incidentId.toString() });
    expect(toSafeRiskAssessment(assessment)).not.toHaveProperty('_id');
  });
  it.each([{ vulnerablePeople: 2 }, { peopleAffected: -1 }, { vulnerablePeople: 0.5 }, { finalRiskLevel: 'HIGH' }])('enforces model invariants %j', async (invalid) => {
    const assessment = document();
    assessment.set(invalid);
    await expect(assessment.validate()).rejects.toThrow();
  });
  it('translates a MongoDB duplicate-key race into a domain conflict', async () => {
    vi.spyOn(RiskAssessmentModel, 'init').mockResolvedValue(document());
    vi.spyOn(RiskAssessmentModel, 'create').mockRejectedValue({ code: 11000, keyPattern: { incidentId: 1, status: 1 } });
    await expect(new MongooseRiskAssessmentRepository().create(toSafeRiskAssessment(document()))).rejects.toBeInstanceOf(ActiveRiskAssessmentExistsError);
  });
  it('does not misreport index initialization failure as an existing assessment', async () => {
    vi.spyOn(RiskAssessmentModel, 'init').mockRejectedValue({ code: 11000, keyPattern: { incidentId: 1, status: 1 } });
    await expect(new MongooseRiskAssessmentRepository().create(toSafeRiskAssessment(document())))
      .rejects.toMatchObject({ code: 'ASSESSMENT_STORAGE_NOT_READY', statusCode: 503 });
  });
  it('identifies the obsolete report index as a migration problem', async () => {
    vi.spyOn(RiskAssessmentModel, 'init').mockResolvedValue(document());
    vi.spyOn(RiskAssessmentModel, 'create').mockRejectedValue({ code: 11000, keyPattern: { hazardReportId: 1, status: 1 } });
    await expect(new MongooseRiskAssessmentRepository().create(toSafeRiskAssessment(document())))
      .rejects.toMatchObject({ code: 'ASSESSMENT_STORAGE_NOT_READY', statusCode: 503 });
  });
  it('preserves unrelated duplicate errors instead of claiming an incident conflict', async () => {
    const failure = { code: 11000, keyPattern: { _id: 1 } };
    vi.spyOn(RiskAssessmentModel, 'init').mockResolvedValue(document());
    vi.spyOn(RiskAssessmentModel, 'create').mockRejectedValue(failure);
    await expect(new MongooseRiskAssessmentRepository().create(toSafeRiskAssessment(document()))).rejects.toBe(failure);
  });
});
