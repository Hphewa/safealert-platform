import type {
  CreateReportRequest,
  CreateReportResponse,
  CancelResidentReportResponse,
  GetResidentReportResponse,
  GetResidentFieldConfirmationsResponse,
  GetResidentReportsResponse,
  UpdateResidentReportRequest,
  UpdateResidentReportResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function createResidentReport(input: CreateReportRequest, accessToken: string, clientOperationId?: string) {
  return apiRequest<CreateReportResponse>('/reports', {
    method: 'POST',
    accessToken,
    ...(clientOperationId ? { idempotencyKey: clientOperationId } : {}),
    body: input
  });
}

export function listMyReports(accessToken: string) {
  return apiRequest<GetResidentReportsResponse>('/reports/mine', {
    accessToken
  });
}

export function getMyReportById(reportId: string, accessToken: string) {
  return apiRequest<GetResidentReportResponse>(`/reports/mine/${encodeURIComponent(reportId)}`, {
    accessToken
  });
}

export function listMyReportFieldConfirmations(reportId: string, accessToken: string) {
  return apiRequest<GetResidentFieldConfirmationsResponse>(`/reports/mine/${encodeURIComponent(reportId)}/field-confirmations`, {
    accessToken
  });
}

export function updateMyPendingReport(
  reportId: string,
  input: UpdateResidentReportRequest,
  accessToken: string
) {
  return apiRequest<UpdateResidentReportResponse>(`/reports/mine/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    accessToken,
    body: input
  });
}

export function cancelMyPendingReport(reportId: string, accessToken: string) {
  return apiRequest<CancelResidentReportResponse>(`/reports/mine/${encodeURIComponent(reportId)}/cancel`, {
    method: 'PATCH',
    accessToken
  });
}
