import type { CreateReportRequest, CreateReportResponse } from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function createResidentReport(input: CreateReportRequest, accessToken: string) {
  return apiRequest<CreateReportResponse>('/reports', {
    method: 'POST',
    accessToken,
    body: input
  });
}
