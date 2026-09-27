import { RiskAssessmentModel, toSafeRiskAssessment } from '../models/riskAssessment.model.js';
import { ApiError } from '../../../shared/apiError.js';
import type { SafeRiskAssessment } from '@safealert/contracts';
import {
  ActiveRiskAssessmentExistsError, RiskAssessmentReassessmentConflictError,
  type CloseActiveRiskAssessmentInput, type CreateRiskAssessmentInput,
  type ReassessRiskAssessmentRecordInput, type RiskAssessmentRepository,
  type SoftDeleteClosedAssessmentInput, type SoftDeleteClosedAssessmentResult
} from './riskAssessment.repository.js';

export class MongooseRiskAssessmentRepository implements RiskAssessmentRepository {
  constructor(private readonly model: typeof RiskAssessmentModel = RiskAssessmentModel) {}

  async create(input: CreateRiskAssessmentInput) {
    const storageNotReady = () => new ApiError(503, 'ASSESSMENT_STORAGE_NOT_READY',
      'Assessment storage needs repair. Run the risk-assessment migration and restart the API. Your assessment has not been saved.');
    try {
      // Wait for the unique index before accepting the first write after startup.
      await this.model.init();
    } catch {
      // Index build failures concern the whole collection, not this incident.
      throw storageNotReady();
    }
    try {
      return toSafeRiskAssessment(await this.model.create(input));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        const pattern = 'keyPattern' in error ? error.keyPattern : null;
        if (typeof pattern === 'object' && pattern !== null) {
          if ('hazardReportId' in pattern) throw storageNotReady();
          if ('incidentId' in pattern && 'status' in pattern) throw new ActiveRiskAssessmentExistsError();
        }
      }
      throw error;
    }
  }
  async reassess(activeAssessmentId: string, input: ReassessRiskAssessmentRecordInput) {
    const storageNotReady = () => new ApiError(503, 'ASSESSMENT_STORAGE_NOT_READY',
      'Assessment storage needs repair. Run the risk-assessment migration and restart the API. Your assessment has not been saved.');
    try {
      await this.model.init();
    } catch {
      throw storageNotReady();
    }

    const session = await this.model.db.startSession();
    const reassessmentResult: { assessment: SafeRiskAssessment | null } = { assessment: null };
    try {
      // The conditional close and replacement insert must commit together under the ACTIVE unique index.
      await session.withTransaction(async () => {
        const closedAt = new Date(input.assessedAt);
        const transition = await this.model.updateOne(
          { _id: activeAssessmentId, incidentId: input.incidentId, status: 'ACTIVE' },
          { $set: {
            status: 'CLOSED', closureReason: 'REASSESSED', closedAt,
            closedById: input.assessedById
          } },
          { session }
        ).exec();
        if (transition.matchedCount !== 1) throw new RiskAssessmentReassessmentConflictError();

        const [created] = await this.model.create([{
          ...input, status: 'ACTIVE', previousAssessmentId: activeAssessmentId
        }], { session });
        if (!created) throw new Error('Reassessment insert returned no record.');
        reassessmentResult.assessment = toSafeRiskAssessment(created);
      });
    } catch (error) {
      if (error instanceof RiskAssessmentReassessmentConflictError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = error.code;
        const pattern = 'keyPattern' in error ? error.keyPattern : null;
        if (code === 11000 && typeof pattern === 'object' && pattern !== null && 'incidentId' in pattern && 'status' in pattern) {
          throw new RiskAssessmentReassessmentConflictError();
        }
        if (code === 112) throw new RiskAssessmentReassessmentConflictError();
      }
      throw error;
    } finally {
      await session.endSession();
    }
    if (!reassessmentResult.assessment) throw new Error('Reassessment transaction completed without a replacement record.');
    return reassessmentResult.assessment;
  }
  async closeActiveAssessment(assessmentId: string, input: CloseActiveRiskAssessmentInput) {
    try {
      const assessment = await this.model.findOneAndUpdate(
        { _id: assessmentId, status: 'ACTIVE' },
        { $set: {
          status: 'CLOSED', closureReason: input.closureReason,
          ...(input.closureNote === undefined ? {} : { closureNote: input.closureNote }),
          closedAt: new Date(input.closedAt), closedById: input.closedById
        } },
        { new: true, runValidators: true }
      ).exec();
      return assessment ? toSafeRiskAssessment(assessment) : null;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 112) return null;
      throw error;
    }
  }
  async softDeleteClosedAssessment(
    assessmentId: string, input: SoftDeleteClosedAssessmentInput
  ): Promise<SoftDeleteClosedAssessmentResult> {
    const updated = await this.model.findOneAndUpdate(
      { _id: assessmentId, status: 'CLOSED', isDeleted: { $ne: true } },
      { $set: {
        isDeleted: true, deletedAt: new Date(input.deletedAt), deletedById: input.deletedById,
        deleteReason: input.deleteReason,
        ...(input.deleteNote === undefined ? {} : { deleteNote: input.deleteNote })
      } },
      { new: true, runValidators: true }
    ).exec();
    if (updated) return { kind: 'deleted', assessment: toSafeRiskAssessment(updated) };

    // Read the unfiltered state only to distinguish a missing record from a stale transition.
    const current = await this.model.findById(assessmentId).select('status isDeleted').exec();
    if (!current) return { kind: 'not_found' };
    if (current.isDeleted === true) return { kind: 'already_deleted' };
    return { kind: 'not_closed' };
  }
  async findById(assessmentId: string) {
    const assessment = await this.model.findOne({ _id: assessmentId, isDeleted: { $ne: true } }).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findActiveByIncidentId(incidentId: string) {
    const assessment = await this.model.findOne({ incidentId, status: 'ACTIVE', isDeleted: { $ne: true } }).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findHistoryByIncidentId(incidentId: string) {
    const assessments = await this.model.find({ incidentId, isDeleted: { $ne: true } })
      .sort({ assessedAt: -1, _id: -1 }).exec();
    return assessments.map(toSafeRiskAssessment);
  }
}
