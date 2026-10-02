import { HAZARD_TYPES, RISK_LEVELS, type RiskMapIncident, type RiskMapResponse, type UserRole } from '@safealert/contracts';
import type { IncidentRepository } from '../../incidents/repositories/incident.repository.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { WarningRepository } from '../../warnings/repositories/warning.repository.js';
import { geoJsonPointSchema } from '../../reports/validation/report.schemas.js';

export class RiskMapService {
  constructor(private readonly incidents: IncidentRepository, private readonly assessments: RiskAssessmentRepository,
    private readonly warnings: WarningRepository) {}

  async list(role: UserRole): Promise<RiskMapResponse> {
    const candidates = await this.incidents.findActiveMapCandidates();
    const valid = candidates.filter(incident => {
      const validLocation = geoJsonPointSchema.safeParse(incident.location).success;
      if (!validLocation) console.warn('Risk Map omitted an incident with an invalid stored location.', { incidentId: incident.id });
      return validLocation && incident.status === 'ACTIVE' && HAZARD_TYPES.includes(incident.hazardType);
    });
    const lifecycle = valid.length ? await this.assessments.findLifecycleByIncidentIds(valid.map(({ id }) => id)) : [];
    const byIncident = new Map(lifecycle.map(item => [item.incidentId, item.currentAssessment]));
    const eligible = valid.flatMap(incident => {
      const assessment = byIncident.get(incident.id);
      // Historical CLOSED/VOID assessments must never become a current risk fallback.
      return assessment?.status === 'ACTIVE' && RISK_LEVELS.includes(assessment.finalRiskLevel)
        && Number.isFinite(Date.parse(assessment.assessedAt)) && Number.isFinite(assessment.calculatedScore)
        ? [{ incident, assessment }] : [];
    }).sort((left, right) => left.incident.id.localeCompare(right.incident.id));
    const warnings = eligible.length ? await this.warnings.findByAssessmentIds(eligible.map(({ assessment }) => assessment.id)) : [];
    const published = new Set(warnings.filter(warning => warning.status === 'PUBLISHED').map(warning => warning.assessmentId));
    const common = ({ incident, assessment }: (typeof eligible)[number]): RiskMapIncident => ({
      incidentId: incident.id, hazardType: incident.hazardType, location: incident.location!,
      riskLevel: assessment.finalRiskLevel, assessedAt: assessment.assessedAt, hasPublishedWarning: published.has(assessment.id)
    });
    const operational = (item: (typeof eligible)[number]) => ({ ...common(item),
      incidentStatus: item.incident.status, reportCount: item.incident.reportCount });
    const generatedAt = new Date().toISOString();
    // Build allowlists explicitly. Stored documents and warning bodies never cross this boundary.
    switch (role) {
      case 'DISASTER_OFFICER': return { role, generatedAt, incidents: eligible.map(item => ({ ...operational(item),
        assessmentId: item.assessment.id, assessmentStatus: 'ACTIVE', calculatedScore: item.assessment.calculatedScore })) };
      case 'EMERGENCY_RESPONDER': return { role, generatedAt, incidents: eligible.map(operational) };
      case 'COMMUNITY_VOLUNTEER': return { role, generatedAt, incidents: eligible.map(common) };
      case 'RESIDENT': return { role, generatedAt, incidents: eligible.map(common) };
    }
  }
}
