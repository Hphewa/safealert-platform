import type {
  GetPendingOfficerReportResponse,
  GetPendingOfficerReportsResponse,
  GetVerifiedOfficerReportsResponse,
  ReportReviewRequest,
  ReviewReportResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function listPendingOfficerReports(accessToken: string) {
  return apiRequest<GetPendingOfficerReportsResponse>('/reports/officer/pending', {
    accessToken
  });
}

export function listVerifiedOfficerReports(accessToken: string) {
  return apiRequest<GetVerifiedOfficerReportsResponse>('/reports/officer/verified', {
    accessToken
  });
}

export function getPendingOfficerReportById(reportId: string, accessToken: string) {
  return apiRequest<GetPendingOfficerReportResponse>(
    `/reports/officer/${encodeURIComponent(reportId)}`,
    {
      accessToken
    }
  );
}

export function reviewOfficerReport(
  reportId: string,
  review: ReportReviewRequest,
  accessToken: string
) {
  return apiRequest<ReviewReportResponse>(
    `/reports/${encodeURIComponent(reportId)}/verification`,
    {
      method: 'PATCH',
      accessToken,
      body: review
    }
  );
}
