import { RiskAssessmentModel, toSafeRiskAssessment } from '../models/riskAssessment.model.js';
import { ApiError } from '../../../shared/apiError.js';
import {
  ActiveRiskAssessmentExistsError, type CreateRiskAssessmentInput, type RiskAssessmentRepository
} from './riskAssessment.repository.js';

export class MongooseRiskAssessmentRepository implements RiskAssessmentRepository {
  async create(input: CreateRiskAssessmentInput) {
    const storageNotReady = () => new ApiError(503, 'ASSESSMENT_STORAGE_NOT_READY',
      'Assessment storage needs repair. Run the risk-assessment migration and restart the API. Your assessment has not been saved.');
    try {
      // Wait for the unique index before accepting the first write after startup.
      await RiskAssessmentModel.init();
    } catch {
      // Index build failures concern the whole collection, not this incident.
      throw storageNotReady();
    }
    try {
      return toSafeRiskAssessment(await RiskAssessmentModel.create(input));
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
  async findById(assessmentId: string) {
    const assessment = await RiskAssessmentModel.findById(assessmentId).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findActiveByIncidentId(incidentId: string) {
    const assessment = await RiskAssessmentModel.findOne({ incidentId, status: 'ACTIVE' }).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
}
