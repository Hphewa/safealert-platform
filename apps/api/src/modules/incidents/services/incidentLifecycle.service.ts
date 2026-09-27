import type {
  IncidentMonitoringDetailResponse, IncidentMonitoringListResponse, InitialAssessmentQueueResponse,
  MonitoringReportSummary, MonitoringWarningSummary, SafeIncident
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { WarningRepository } from '../../warnings/repositories/warning.repository.js';
import type { IncidentRepository } from '../repositories/incident.repository.js';

export class IncidentLifecycleService {
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly reports: ReportRepository,
    private readonly assessments: RiskAssessmentRepository,
    private readonly warnings: WarningRepository
  ) {}

  async listInitialAssessmentQueue(): Promise<InitialAssessmentQueueResponse> {
    const incidents = await this.incidents.findActive();
    if (incidents.length === 0) return { incidents: [] };
    const lifecycle = await this.assessments.findLifecycleByIncidentIds(incidents.map(({ id }) => id));
    const neverAssessed = new Set(lifecycle.filter(({ hasEverBeenAssessed }) => !hasEverBeenAssessed)
      .map(({ incidentId }) => incidentId));
    const candidates = incidents.filter(({ id }) => neverAssessed.has(id));
    const reportIds = [...new Set(candidates.flatMap(({ reportIds }) => reportIds))];
    const reports = await this.reports.findReportsByIds(reportIds);
    const reportsById = new Map(reports.filter(({ status }) => status === 'VERIFIED').map((report) => [report.id, report]));
    return { incidents: candidates.flatMap((incident) => {
      const verifiedReports = incident.reportIds.flatMap((reportId) => {
        const report = reportsById.get(reportId);
        return report ? [report] : [];
      });
      return verifiedReports.length ? [{ incident, reports: verifiedReports }] : [];
    }) };
  }

  async listMonitoring(): Promise<IncidentMonitoringListResponse> {
    const incidents = await this.incidents.findAll();
    if (incidents.length === 0) return { incidents: [] };
    const lifecycle = await this.assessments.findLifecycleByIncidentIds(incidents.map(({ id }) => id));
    const byIncident = new Map(lifecycle.map((item) => [item.incidentId, item]));
    const monitored = incidents.filter(({ id }) => byIncident.get(id)?.hasEverBeenAssessed);
    if (monitored.length === 0) return { incidents: [] };
    const reportIds = [...new Set(monitored.flatMap(({ reportIds }) => reportIds))];
    const reportSummaries = await this.reports.findVerifiedSummariesByIds(reportIds);
    const summariesByReport = new Map(reportSummaries.map((report) => [report.id, report]));
    const assessmentIds = [...new Set(monitored.flatMap(({ id }) => {
      const history = byIncident.get(id);
      return [history?.currentAssessment?.id, history?.latestAssessment?.id].filter((value): value is string => Boolean(value));
    }))];
    const warnings = await this.warnings.findByAssessmentIds(assessmentIds);
    const warningSummaries: MonitoringWarningSummary[] = warnings.map(({ id, assessmentId, status, createdAt, publishedAt }) => ({
      id, assessmentId, status, createdAt, ...(publishedAt ? { publishedAt } : {})
    }));
    return { incidents: monitored.map((incident) => this.compose(incident, byIncident.get(incident.id)!, summariesByReport, warningSummaries).monitoring) };
  }

  async getMonitoringDetail(incidentId: string): Promise<IncidentMonitoringDetailResponse> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new ApiError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    const [lifecycle] = await this.assessments.findLifecycleByIncidentIds([incidentId]);
    if (!lifecycle?.hasEverBeenAssessed) throw new ApiError(404, 'INCIDENT_NOT_MONITORED', 'Incident has not entered monitoring.');
    const reportSummaries = await this.reports.findVerifiedSummariesByIds(incident.reportIds);
    const summariesByReport = new Map(reportSummaries.map((report) => [report.id, report]));
    const assessmentIds = [lifecycle.currentAssessment?.id, lifecycle.latestAssessment?.id]
      .filter((value): value is string => Boolean(value));
    const warnings = await this.warnings.findByAssessmentIds(assessmentIds);
    const warningSummaries: MonitoringWarningSummary[] = warnings.map(({ id, assessmentId, status, createdAt, publishedAt }) => ({
      id, assessmentId, status, createdAt, ...(publishedAt ? { publishedAt } : {})
    }));
    const composed = this.compose(incident, lifecycle, summariesByReport, warningSummaries);
    return { monitoring: composed.monitoring, recentVerifiedReports: composed.recentVerifiedReports };
  }

  private compose(
    incident: SafeIncident,
    lifecycle: NonNullable<Awaited<ReturnType<RiskAssessmentRepository['findLifecycleByIncidentIds']>>[number]>,
    reportsById: Map<string, MonitoringReportSummary>,
    warnings: MonitoringWarningSummary[]
  ): { monitoring: IncidentMonitoringListResponse['incidents'][number]; recentVerifiedReports: MonitoringReportSummary[] } {
    const verifiedReports = incident.reportIds.flatMap((id) => {
      const report = reportsById.get(id);
      return report ? [report] : [];
    });
    const recentVerifiedReports = [...verifiedReports].sort((left, right) =>
      (right.verifiedAt ?? '').localeCompare(left.verifiedAt ?? '') || right.id.localeCompare(left.id)
    ).slice(0, 5);
    const currentAssessment = lifecycle.currentAssessment;
    const newVerifiedReportsSinceAssessment = currentAssessment
      ? verifiedReports.filter(({ verifiedAt }) => Boolean(verifiedAt && verifiedAt > currentAssessment.assessedAt)).length
      : 0;
    const latestVerifiedReportAt = verifiedReports.reduce<string | null>((latest, { verifiedAt }) =>
      verifiedAt && (!latest || verifiedAt > latest) ? verifiedAt : latest, null);
    return {
      monitoring: {
        incident, currentAssessment, latestAssessment: lifecycle.latestAssessment,
        totalVerifiedReports: verifiedReports.length,
        newVerifiedReportsSinceAssessment,
        latestVerifiedReportAt,
        hasNewVerifiedEvidence: newVerifiedReportsSinceAssessment > 0,
        warnings: warnings.filter(({ assessmentId }) => assessmentId === currentAssessment?.id || assessmentId === lifecycle.latestAssessment?.id)
      },
      recentVerifiedReports
    };
  }
}
