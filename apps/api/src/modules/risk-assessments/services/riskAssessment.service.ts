import type {
  CalculateRiskAssessmentRequest, CalculateRiskAssessmentResponse, CreateRiskAssessmentRequest,
  RiskAssessmentForReportResponse, RiskAssessmentResponse
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import { ActiveRiskAssessmentExistsError, type RiskAssessmentRepository } from '../repositories/riskAssessment.repository.js';
import { calculateRisk } from './riskCalculation.service.js';

export class RiskAssessmentService {
  constructor(private readonly repository: RiskAssessmentRepository, private readonly reports: ReportRepository) {}
  private async getReport(hazardReportId: string) {
    const report = await this.reports.findReportById(hazardReportId);
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    return report;
  }
  private async getVerifiedReport(hazardReportId: string) {
    const report = await this.getReport(hazardReportId);
    if (report.status !== 'VERIFIED') {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only verified reports can be assessed.');
    }
    return report;
  }
  async calculate(input: CalculateRiskAssessmentRequest): Promise<CalculateRiskAssessmentResponse> {
    const report = await this.getVerifiedReport(input.hazardReportId);
    const result = calculateRisk(input, report.hazardType);
    return { calculatedScore: result.score, systemSuggestedRisk: result.suggestedRisk };
  }
  async create(officerId: string, input: CreateRiskAssessmentRequest): Promise<RiskAssessmentResponse> {
    const report = await this.getVerifiedReport(input.hazardReportId);
    const conflict = () => new ApiError(409, 'ACTIVE_ASSESSMENT_EXISTS', 'An active risk assessment already exists for this report.');
    if (await this.repository.findActiveByHazardReportId(report.id)) throw conflict();
    // Recalculate after preview: never trust client scoring or officer identity.
    const { score, suggestedRisk } = calculateRisk(input, report.hazardType);
    if (input.finalRiskLevel !== suggestedRisk && !input.decisionReason?.trim()) {
      throw new ApiError(400, 'DECISION_REASON_REQUIRED', 'A decision reason is required when overriding suggested risk.');
    }
    try {
      const assessment = await this.repository.create({
        hazardReportId: report.id, hazardSeverity: input.hazardSeverity,
        peopleAffected: input.peopleAffected, vulnerablePeople: input.vulnerablePeople,
        roadAccessibility: input.roadAccessibility, infrastructureImpact: input.infrastructureImpact,
        waterLevelTrend: input.waterLevelTrend, weatherCondition: input.weatherCondition,
        finalRiskLevel: input.finalRiskLevel,
        ...(input.decisionReason ? { decisionReason: input.decisionReason.trim() } : {}),
        calculatedScore: score, systemSuggestedRisk: suggestedRisk,
        assessedById: officerId, status: 'ACTIVE', assessedAt: new Date().toISOString()
      });
      return { assessment, report };
    } catch (error) {
      if (error instanceof ActiveRiskAssessmentExistsError) throw conflict();
      throw error;
    }
  }
  async getById(assessmentId: string): Promise<RiskAssessmentResponse> {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    return { assessment, report: await this.getReport(assessment.hazardReportId) };
  }
  async getForReport(hazardReportId: string): Promise<RiskAssessmentForReportResponse> {
    const report = await this.getReport(hazardReportId);
    // Existing results remain readable even if the related report is later resolved.
    return { report, assessment: await this.repository.findActiveByHazardReportId(report.id) };
  }
}
