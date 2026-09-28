import type {
  AddIncidentReportRequest,
  CreateIncidentRequest,
  IncidentCandidatesResponse,
  IncidentResponse,
  IncidentWithReportsResponse,
  GetActiveIncidentsResponse,
  InitialAssessmentQueueResponse,
  IncidentMonitoringListResponse,
  IncidentMonitoringDetailResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function listActiveIncidents(accessToken: string) {
  return apiRequest<GetActiveIncidentsResponse>('/incidents/active', { accessToken });
}

export function listInitialAssessmentQueue(accessToken: string) {
  return apiRequest<InitialAssessmentQueueResponse>('/incidents/assessment-queue', { accessToken });
}

export function listIncidentMonitoring(accessToken: string): Promise<IncidentMonitoringListResponse> {
  return apiRequest<IncidentMonitoringListResponse>('/incidents/monitoring', { accessToken });
}

export function getIncidentMonitoringDetail(incidentId: string, accessToken: string): Promise<IncidentMonitoringDetailResponse> {
  return apiRequest<IncidentMonitoringDetailResponse>(`/incidents/monitoring/${encodeURIComponent(incidentId)}`, { accessToken });
}

export function getIncidentCandidates(reportId: string, accessToken: string) {
  return apiRequest<IncidentCandidatesResponse>(
    `/incidents/candidates?reportId=${encodeURIComponent(reportId)}`,
    { accessToken }
  );
}

export function createIncidentFromReport(reportId: string, accessToken: string) {
  const input: CreateIncidentRequest = { reportIds: [reportId] };
  return apiRequest<IncidentResponse>('/incidents', {
    method: 'POST',
    accessToken,
    body: input
  });
}

export function attachReportToIncident(incidentId: string, reportId: string, accessToken: string) {
  const input: AddIncidentReportRequest = { reportId };
  return apiRequest<IncidentResponse>(
    `/incidents/${encodeURIComponent(incidentId)}/reports`,
    { method: 'POST', accessToken, body: input }
  );
}

export function getIncidentDetails(incidentId: string, accessToken: string) {
  return apiRequest<IncidentWithReportsResponse>(
    `/incidents/${encodeURIComponent(incidentId)}/reports`,
    { accessToken }
  );
}
