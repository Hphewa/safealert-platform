import type {
  CreateReportRequest,
  CreateReportResponse,
  GetResidentReportResponse,
  GetResidentReportsResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function createResidentReport(input: CreateReportRequest, accessToken: string) {
  return apiRequest<CreateReportResponse>('/reports', {
    method: 'POST',
    accessToken,
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
