import { RiskAssessmentModel, toSafeRiskAssessment } from '../models/riskAssessment.model.js';
import {
  ActiveRiskAssessmentExistsError, type CreateRiskAssessmentInput, type RiskAssessmentRepository
} from './riskAssessment.repository.js';

export class MongooseRiskAssessmentRepository implements RiskAssessmentRepository {
  async create(input: CreateRiskAssessmentInput) {
    try {
      // Wait for the unique index before accepting the first write after startup.
      await RiskAssessmentModel.init();
      return toSafeRiskAssessment(await RiskAssessmentModel.create(input));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ActiveRiskAssessmentExistsError();
      }
      throw error;
    }
  }
  async findById(assessmentId: string) {
    const assessment = await RiskAssessmentModel.findById(assessmentId).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
  async findActiveByHazardReportId(hazardReportId: string) {
    const assessment = await RiskAssessmentModel.findOne({ hazardReportId, status: 'ACTIVE' }).exec();
    return assessment ? toSafeRiskAssessment(assessment) : null;
  }
}
