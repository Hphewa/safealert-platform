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
  it('persists and safely serializes reassessment lineage and closure metadata', async () => {
    const assessment = document();
    assessment.status = 'CLOSED';
    const previousAssessmentId = new mongoose.Types.ObjectId();
    const closedById = new mongoose.Types.ObjectId();
    assessment.set({
      previousAssessmentId, reassessmentReason: 'Conditions changed substantially.',
      closureReason: 'REASSESSED', closedAt: new Date('2026-09-26T12:30:00.000Z'), closedById
    });

    await expect(assessment.validate()).resolves.toBeUndefined();
    expect(RiskAssessmentModel.schema.path('previousAssessmentId').options.ref).toBe('RiskAssessment');
    expect(RiskAssessmentModel.schema.path('closedById').options.ref).toBe('User');
    expect(toSafeRiskAssessment(assessment)).toMatchObject({
      previousAssessmentId: previousAssessmentId.toString(),
      reassessmentReason: 'Conditions changed substantially.',
      closureReason: 'REASSESSED',
      closedAt: '2026-09-26T12:30:00.000Z',
      closedById: closedById.toString()
    });
  });
  it.each(['INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED'])(
    'validates manual closure %s without a note', async (closureReason) => {
      const assessment = document();
      assessment.set({ status: 'CLOSED', closureReason, closedAt: new Date(), closedById: new mongoose.Types.ObjectId() });
      await expect(assessment.validate()).resolves.toBeUndefined();
      expect(toSafeRiskAssessment(assessment).closureReason).toBe(closureReason);
    });
  it('trims and serializes an OTHER closure note', async () => {
    const assessment = document();
    assessment.set({
      status: 'CLOSED', closureReason: 'OTHER', closureNote: '  Conditions reviewed and resolved.  ',
      closedAt: new Date(), closedById: new mongoose.Types.ObjectId()
    });
    await expect(assessment.validate()).resolves.toBeUndefined();
    expect(toSafeRiskAssessment(assessment).closureNote).toBe('Conditions reviewed and resolved.');
  });
  it.each([
    { status: 'ACTIVE' }, { closedAt: undefined }, { closedById: undefined }
  ])('requires complete lifecycle metadata for a manual reason: %j', async (missing) => {
    const assessment = document();
    assessment.set({
      status: 'CLOSED', closureReason: 'INCIDENT_RESOLVED', closedAt: new Date(),
      closedById: new mongoose.Types.ObjectId(), ...missing
    });
    await expect(assessment.validate()).rejects.toThrow();
  });
  it.each([undefined, '', '     ', 'too short', 'x'.repeat(501)])(
    'requires a valid note for OTHER: %j', async (closureNote) => {
      const assessment = document();
      assessment.set({
        status: 'CLOSED', closureReason: 'OTHER', closureNote,
        closedAt: new Date(), closedById: new mongoose.Types.ObjectId()
      });
      await expect(assessment.validate()).rejects.toThrow();
    });
  it('accepts legacy CLOSED records without closure metadata', async () => {
    const assessment = document();
    assessment.status = 'CLOSED';
    await expect(assessment.validate()).resolves.toBeUndefined();
  });
  it('does not require a manual note for REASSESSED', async () => {
    const assessment = document();
    assessment.set({
      status: 'CLOSED', closureReason: 'REASSESSED', closedAt: new Date(),
      closedById: new mongoose.Types.ObjectId()
    });
    await expect(assessment.validate()).resolves.toBeUndefined();
  });
  it('filters Mongo history by incident, sorts all results deterministically, and serializes safe assessments', async () => {
    const assessment = document();
    const query = RiskAssessmentModel.find();
    const sort = vi.spyOn(query, 'sort').mockReturnValue(query);
    const execute = vi.spyOn(query, 'exec').mockResolvedValue([assessment]);
    const find = vi.spyOn(RiskAssessmentModel, 'find').mockReturnValue(query);

    const result = await new MongooseRiskAssessmentRepository().findHistoryByIncidentId(assessment.incidentId.toString());

    expect(find).toHaveBeenCalledWith({ incidentId: assessment.incidentId.toString() });
    expect(sort).toHaveBeenCalledWith({ assessedAt: -1, _id: -1 });
    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual([toSafeRiskAssessment(assessment)]);
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
