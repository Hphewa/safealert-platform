import type {
  IncidentActivityTimelineResponse, RiskActivityEvent, SafeIncident, SafeReport, SafeRiskAssessment, SafeWarning
} from '@safealert/contracts';

export function buildIncidentActivityTimeline(
  incident: SafeIncident,
  reports: SafeReport[],
  assessments: SafeRiskAssessment[],
  warnings: SafeWarning[]
): IncidentActivityTimelineResponse {
  const events: RiskActivityEvent[] = [{
    id: `incident-created:${incident.id}`, type: 'INCIDENT_CREATED', timestamp: incident.createdAt,
    title: 'Incident created', relatedRecordId: incident.id
  }];

  for (const report of reports) {
    events.push({ id: `report-created:${report.id}`, type: 'REPORT_CREATED', timestamp: report.createdAt,
      title: 'Report added', relatedRecordId: report.id });
    const verifications = (report.verificationHistory ?? []).filter((entry) => entry.action === 'VERIFY');
    const verifiedAt = verifications.length ? verifications.map((entry) => entry.verifiedAt) :
      (report.verifiedAt ? [report.verifiedAt] : []);
    verifiedAt.forEach((timestamp, index) => events.push({
      id: `report-verified:${report.id}:${timestamp}:${index}`, type: 'REPORT_VERIFIED', timestamp,
      title: 'Report verified', relatedRecordId: report.id
    }));
  }

  const assessmentsById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  for (const assessment of assessments) {
    if (assessment.status === 'CLOSED' && assessment.closureReason === 'REASSESSED' && !assessment.previousAssessmentId) continue;
    if (assessment.previousAssessmentId) {
      const previous = assessmentsById.get(assessment.previousAssessmentId);
      const comparison = previous
        ? `${previous.finalRiskLevel} (score ${previous.calculatedScore}) → ${assessment.finalRiskLevel} (score ${assessment.calculatedScore})`
        : undefined;
      events.push({ id: `assessment-reassessed:${assessment.id}`, type: 'ASSESSMENT_REASSESSED',
        timestamp: assessment.assessedAt, title: 'Risk assessment updated',
        ...(comparison ? { description: comparison } : {}), relatedRecordId: assessment.id });
    } else {
      events.push({ id: `assessment-created:${assessment.id}`, type: 'ASSESSMENT_CREATED',
        timestamp: assessment.assessedAt, title: 'Risk assessment completed',
        description: `${assessment.finalRiskLevel} risk; score ${assessment.calculatedScore}`,
        relatedRecordId: assessment.id });
    }
    if (assessment.status === 'CLOSED' && assessment.closedAt && assessment.closureReason && assessment.closureReason !== 'REASSESSED') {
      events.push({ id: `assessment-closed:${assessment.id}`, type: 'ASSESSMENT_CLOSED', timestamp: assessment.closedAt,
        title: 'Assessment closed', description: assessment.closureReason.replace(/_/g, ' ').toLowerCase(),
        relatedRecordId: assessment.id });
    }
  }

  for (const warning of warnings) {
    events.push({ id: `warning-created:${warning.id}`, type: 'WARNING_CREATED', timestamp: warning.createdAt,
      title: 'Warning created', relatedRecordId: warning.id });
    if (warning.publishedAt) events.push({ id: `warning-published:${warning.id}`, type: 'WARNING_PUBLISHED',
      timestamp: warning.publishedAt, title: 'Warning published', relatedRecordId: warning.id });
  }

  events.sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id));
  return { incidentId: incident.id, events };
}
