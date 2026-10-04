import { HAZARD_TYPES, RISK_LEVELS, type OfficerRiskLocationDetails, type ResidentRiskLocationDetails,
  type ResponderRiskLocationDetails, type RiskMapIncident, type RiskMapResponse, type UserRole,
  type VolunteerRiskLocationDetails } from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { IncidentRepository } from '../../incidents/repositories/incident.repository.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { WarningRepository } from '../../warnings/repositories/warning.repository.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import { geoJsonPointSchema } from '../../reports/validation/report.schemas.js';

export class RiskMapService {
  constructor(private readonly incidents: IncidentRepository, private readonly assessments: RiskAssessmentRepository,
    private readonly warnings: WarningRepository, private readonly reports: ReportRepository) {}

  async getRiskLocationDetails(incidentId: string, role: UserRole): Promise<
    OfficerRiskLocationDetails | ResponderRiskLocationDetails | VolunteerRiskLocationDetails | ResidentRiskLocationDetails
  > {
    if (!/^[a-f\d]{24}$/i.test(incidentId)) throw new ApiError(400, 'INVALID_INCIDENT_ID', 'A valid incident id is required.');
    const incident = await this.incidents.findById(incidentId);
    const location = incident ? geoJsonPointSchema.safeParse(incident.location) : null;
    if (!incident || incident.status !== 'ACTIVE' || !location?.success || !HAZARD_TYPES.includes(incident.hazardType)) {
      throw new ApiError(404, 'RISK_LOCATION_NOT_FOUND', 'This active risk location is not available.');
    }

    const [lifecycle] = await this.assessments.findLifecycleByIncidentIds([incident.id]);
    const current = lifecycle?.currentAssessment;
    if (!current || current.status !== 'ACTIVE') {
      throw new ApiError(404, 'RISK_LOCATION_NOT_FOUND', 'This active risk location is not available.');
    }
    // The shared lifecycle selects which record is current; this single focused read supplies its factors.
    const assessment = await this.assessments.findById(current.id);
    if (!assessment || assessment.status !== 'ACTIVE' || assessment.isDeleted || !RISK_LEVELS.includes(assessment.finalRiskLevel)) {
      throw new ApiError(404, 'RISK_LOCATION_NOT_FOUND', 'This active risk location is not available.');
    }

    const [images, warnings] = await Promise.all([
      this.reports.findVerifiedImageEvidenceByIds(incident.reportIds),
      this.warnings.findByAssessmentIds([assessment.id])
    ]);
    const seenImages = new Set<string>();
    const evidence = images.filter(image => {
      if (seenImages.has(image.imageReference)) return false;
      seenImages.add(image.imageReference);
      return true;
    }).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.imageReference.localeCompare(right.imageReference))
      .map(image => ({ type: 'IMAGE' as const, imageUrl: image.imageReference, createdAt: image.createdAt }));
    const hasPublishedWarning = warnings.some(warning => warning.status === 'PUBLISHED' && warning.assessmentId === assessment.id);
    const shared = {
      incidentId: incident.id, hazardType: incident.hazardType, location: location.data,
      riskLevel: assessment.finalRiskLevel, assessedAt: assessment.assessedAt, hasPublishedWarning, evidence
    };
    const responderFactors = {
      hazardSeverity: assessment.hazardSeverity, peopleAffected: assessment.peopleAffected,
      vulnerablePeople: assessment.vulnerablePeople, roadAccessibility: assessment.roadAccessibility,
      infrastructureImpact: assessment.infrastructureImpact, waterLevelTrend: assessment.waterLevelTrend,
      weatherCondition: assessment.weatherCondition
    };
    if (role === 'DISASTER_OFFICER' || role === 'EMERGENCY_RESPONDER') {
      const responder: ResponderRiskLocationDetails = { ...shared, incidentStatus: 'ACTIVE', reportCount: incident.reportIds.length, riskFactors: responderFactors };
      return role === 'DISASTER_OFFICER'
        ? { ...responder, assessmentId: assessment.id, calculatedScore: assessment.calculatedScore }
        : responder;
    }
    const volunteer: VolunteerRiskLocationDetails = { ...shared, riskFactors: {
      hazardSeverity: assessment.hazardSeverity, peopleAffected: assessment.peopleAffected,
      roadAccessibility: assessment.roadAccessibility, infrastructureImpact: assessment.infrastructureImpact,
      waterLevelTrend: assessment.waterLevelTrend, weatherCondition: assessment.weatherCondition
    } };
    if (role === 'COMMUNITY_VOLUNTEER') return volunteer;
    return { ...volunteer, riskFactors: {
      roadAccessibility: assessment.roadAccessibility, infrastructureImpact: assessment.infrastructureImpact,
      waterLevelTrend: assessment.waterLevelTrend, weatherCondition: assessment.weatherCondition
    } };
  }

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
