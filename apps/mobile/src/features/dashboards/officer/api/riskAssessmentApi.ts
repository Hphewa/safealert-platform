import type {
  CalculateRiskAssessmentRequest, CalculateRiskAssessmentResponse, CreateRiskAssessmentRequest,
  GetVerifiedOfficerReportsResponse, RiskAssessmentForIncidentResponse, RiskAssessmentResponse
} from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';

// The central client supplies authentication headers and consistent API errors.
export function calculateRiskAssessment(input: CalculateRiskAssessmentRequest, accessToken: string) {
  return apiRequest<CalculateRiskAssessmentResponse>('/risk-assessments/calculate', {
    method: 'POST', body: input, accessToken
  });
}
export function createRiskAssessment(input: CreateRiskAssessmentRequest, accessToken: string) {
  return apiRequest<RiskAssessmentResponse>('/risk-assessments', { method: 'POST', body: input, accessToken });
}
export function getRiskAssessment(assessmentId: string, accessToken: string) {
  return apiRequest<RiskAssessmentResponse>(`/risk-assessments/${encodeURIComponent(assessmentId)}`, { accessToken });
}
export function getRiskAssessmentForIncident(incidentId: string, accessToken: string) {
  return apiRequest<RiskAssessmentForIncidentResponse>(`/risk-assessments/incident/${encodeURIComponent(incidentId)}`, { accessToken });
}
export function listVerifiedOfficerReports(accessToken: string) {
  return apiRequest<GetVerifiedOfficerReportsResponse>('/reports/officer/verified', { accessToken });
}
