import type { AcknowledgeWarningRequest, AcknowledgeWarningResponse, ResidentWarningResponse, ResidentWarningsResponse } from '@safealert/contracts';
import { apiRequest } from '../../../services/api/client';

export function listResidentWarnings(accessToken: string) {
  return apiRequest<ResidentWarningsResponse>('/warnings', { accessToken });
}
export function getResidentWarning(warningId: string, accessToken: string) {
  return apiRequest<ResidentWarningResponse>(`/warnings/${encodeURIComponent(warningId)}`, { accessToken });
}
export function acknowledgeResidentWarning(warningId: string, input: AcknowledgeWarningRequest, accessToken: string) {
  return apiRequest<AcknowledgeWarningResponse>(`/warnings/${encodeURIComponent(warningId)}/acknowledge`, { method: 'POST', body: input, accessToken });
}
