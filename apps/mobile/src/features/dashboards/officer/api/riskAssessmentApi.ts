import type {
  CalculateRiskAssessmentRequest, CalculateRiskAssessmentResponse, CloseRiskAssessmentRequest,
  CloseRiskAssessmentResponse, CreateRiskAssessmentRequest, DeleteRiskAssessmentRequest, DeleteRiskAssessmentResponse,
  GetVerifiedOfficerReportsResponse, ReassessRiskAssessmentRequest, RiskAssessmentForIncidentResponse, RiskAssessmentHistoryResponse,
  RiskAssessmentResponse
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
export function reassessRiskAssessment(assessmentId: string, input: ReassessRiskAssessmentRequest, accessToken: string) {
  return apiRequest<RiskAssessmentResponse>(`/risk-assessments/${encodeURIComponent(assessmentId)}/reassess`, {
    method: 'POST', body: input, accessToken
  });
}
export function closeRiskAssessment(
  assessmentId: string, input: CloseRiskAssessmentRequest, accessToken: string
): Promise<CloseRiskAssessmentResponse> {
  return apiRequest<CloseRiskAssessmentResponse>(`/risk-assessments/${encodeURIComponent(assessmentId)}/close`, {
    method: 'PATCH', body: input, accessToken
  });
}
export function softDeleteRiskAssessment(
  assessmentId: string, input: DeleteRiskAssessmentRequest, accessToken: string
): Promise<DeleteRiskAssessmentResponse> {
  return apiRequest<DeleteRiskAssessmentResponse>(`/risk-assessments/${encodeURIComponent(assessmentId)}/delete`, {
    method: 'PATCH', body: input, accessToken
  });
}
export function getRiskAssessment(assessmentId: string, accessToken: string) {
  return apiRequest<RiskAssessmentResponse>(`/risk-assessments/${encodeURIComponent(assessmentId)}`, { accessToken });
}
export function getRiskAssessmentForIncident(incidentId: string, accessToken: string) {
  return apiRequest<RiskAssessmentForIncidentResponse>(`/risk-assessments/incident/${encodeURIComponent(incidentId)}`, { accessToken });
}
export function getRiskAssessmentHistory(incidentId: string, accessToken: string) {
  return apiRequest<RiskAssessmentHistoryResponse>(
    `/risk-assessments/incident/${encodeURIComponent(incidentId)}/history`, { accessToken }
  );
}
export function listVerifiedOfficerReports(accessToken: string) {
  return apiRequest<GetVerifiedOfficerReportsResponse>('/reports/officer/verified', { accessToken });
}
