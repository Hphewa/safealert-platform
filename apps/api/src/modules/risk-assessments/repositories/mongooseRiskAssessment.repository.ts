import { RiskAssessmentModel, toSafeRiskAssessment } from '../models/riskAssessment.model.js';
import { ApiError } from '../../../shared/apiError.js';
import {
  ActiveRiskAssessmentExistsError, RiskAssessmentReassessmentConflictError,
  type CreateRiskAssessmentInput, type ReassessRiskAssessmentRecordInput, type RiskAssessmentRepository
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
    let reassessed: Awaited<ReturnType<typeof toSafeRiskAssessment>> | null = null;
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
        reassessed = toSafeRiskAssessment(created);
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
    if (!reassessed) throw new Error('Reassessment transaction completed without a replacement record.');
    return reassessed;
  }
  async findById(assessmentId: string) {
    const assessment = await this.model.findById(assessmentId).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findActiveByIncidentId(incidentId: string) {
    const assessment = await this.model.findOne({ incidentId, status: 'ACTIVE' }).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findHistoryByIncidentId(incidentId: string) {
    const assessments = await this.model.find({ incidentId })
      .sort({ assessedAt: -1, _id: -1 }).exec();
    return assessments.map(toSafeRiskAssessment);
  }
}
