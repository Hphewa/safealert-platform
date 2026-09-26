import type {
  CalculateRiskAssessmentRequest, CalculateRiskAssessmentResponse, CreateRiskAssessmentRequest,
  RiskAssessmentForIncidentResponse, RiskAssessmentHistoryResponse, RiskAssessmentResponse,
  SafeIncident, SafeReport
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { IncidentRepository } from '../../incidents/repositories/incident.repository.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import { ActiveRiskAssessmentExistsError, type RiskAssessmentRepository } from '../repositories/riskAssessment.repository.js';
import { calculateRisk } from './riskCalculation.service.js';

export class RiskAssessmentService {
  constructor(private readonly repository: RiskAssessmentRepository, private readonly incidents: IncidentRepository, private readonly reports: ReportRepository) {}

  private async getIncidentWithReports(incidentId: string, requireActive = false): Promise<{ incident: SafeIncident; reports: SafeReport[] }> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    if (requireActive && incident.status !== 'ACTIVE') throw new ApiError(409, 'INCIDENT_NOT_ACTIVE', 'Only active incidents can be assessed.');
    const reports = await this.reports.findReportsByIds(incident.reportIds);
    const reportsById = new Map(reports.map((report) => [report.id, report]));
    const orderedReports = incident.reportIds.flatMap((reportId) => { const report = reportsById.get(reportId); return report ? [report] : []; });
    if (!orderedReports.length || (requireActive && orderedReports.every((report) => report.status !== 'VERIFIED'))) {
      throw new ApiError(409, 'INVALID_INCIDENT_STATE', 'An incident must contain at least one verified report.');
    }
    return { incident, reports: orderedReports };
  }

  async calculate(input: CalculateRiskAssessmentRequest): Promise<CalculateRiskAssessmentResponse> {
    const { incident } = await this.getIncidentWithReports(input.incidentId, true);
    const result = calculateRisk(input, incident.hazardType);
    return { calculatedScore: result.score, systemSuggestedRisk: result.suggestedRisk };
  }

  async create(officerId: string, input: CreateRiskAssessmentRequest): Promise<RiskAssessmentResponse> {
    const context = await this.getIncidentWithReports(input.incidentId, true);
    const conflict = () => new ApiError(409, 'ACTIVE_ASSESSMENT_EXISTS', 'An active risk assessment already exists for this incident.');
    if (await this.repository.findActiveByIncidentId(context.incident.id)) throw conflict();
    const { score, suggestedRisk } = calculateRisk(input, context.incident.hazardType);
    if (input.finalRiskLevel !== suggestedRisk && !input.decisionReason?.trim()) throw new ApiError(400, 'DECISION_REASON_REQUIRED', 'A decision reason is required when overriding suggested risk.');
    try {
      const assessment = await this.repository.create({
        incidentId: context.incident.id, hazardSeverity: input.hazardSeverity,
        peopleAffected: input.peopleAffected, vulnerablePeople: input.vulnerablePeople,
        roadAccessibility: input.roadAccessibility, infrastructureImpact: input.infrastructureImpact,
        waterLevelTrend: input.waterLevelTrend, weatherCondition: input.weatherCondition,
        finalRiskLevel: input.finalRiskLevel, ...(input.decisionReason ? { decisionReason: input.decisionReason.trim() } : {}),
        calculatedScore: score, systemSuggestedRisk: suggestedRisk, assessedById: officerId, status: 'ACTIVE', assessedAt: new Date().toISOString()
      });
      return { assessment, incident: context.incident, reports: context.reports };
    } catch (error) { if (error instanceof ActiveRiskAssessmentExistsError) throw conflict(); throw error; }
  }

  async getById(assessmentId: string): Promise<RiskAssessmentResponse> {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    return { assessment, ...(await this.getIncidentWithReports(assessment.incidentId)) };
  }

  async getForIncident(incidentId: string): Promise<RiskAssessmentForIncidentResponse> {
    const context = await this.getIncidentWithReports(incidentId);
    return { ...context, assessment: await this.repository.findActiveByIncidentId(incidentId) };
  }

  async getHistoryForIncident(incidentId: string): Promise<RiskAssessmentHistoryResponse> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    return {
      incidentId: incident.id,
      assessments: await this.repository.findHistoryByIncidentId(incident.id)
    };
  }
}
