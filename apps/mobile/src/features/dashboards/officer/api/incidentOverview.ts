import type { RiskAssessmentForIncidentResponse } from '@safealert/contracts';
import { getRiskAssessmentForIncident } from './riskAssessmentApi';
import { listInitialAssessmentQueue } from './incidentApi';
import { ApiClientError } from '../../../../services/api/client';

export type IncidentOverview = RiskAssessmentForIncidentResponse & { canStartInitialAssessment: boolean };
export const NO_VERIFIED_INCIDENT_EVIDENCE = 'This incident has no verified reports available. Return to Assessments for the latest queue.';

export async function loadIncidentOverview(incidentId: string, accessToken: string): Promise<IncidentOverview> {
  const context = await getRiskAssessmentForIncident(incidentId, accessToken).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.code === 'INVALID_INCIDENT_STATE') throw new Error(NO_VERIFIED_INCIDENT_EVIDENCE);
    throw error;
  });
  if (context.incident.id !== incidentId) throw new Error('The requested incident information is unavailable.');
  const reports = context.reports.filter((report) => report.status === 'VERIFIED');
  if (context.assessment || context.incident.status !== 'ACTIVE' || reports.length === 0) {
    return { ...context, reports, canStartInitialAssessment: false };
  }
  // Context returns only the active assessment. Queue membership also excludes past/closed assessments.
  const queue = await listInitialAssessmentQueue(accessToken);
  return { ...context, reports, canStartInitialAssessment: queue.incidents.some(({ incident }) => incident.id === incidentId) };
}
