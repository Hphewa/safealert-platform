import type {
  GetCommunityReportResponse,
  GetCommunityReportsResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

type ListCommunityReportsInput =
  | {
      mode: 'incoming';
      accessToken: string;
    }
  | {
      mode: 'nearby';
      accessToken: string;
      latitude: number;
      longitude: number;
      radiusKm: number;
    };

export function listCommunityReports(input: ListCommunityReportsInput) {
  const searchParams = new URLSearchParams();

  searchParams.set('mode', input.mode);

  if (input.mode === 'nearby') {
    searchParams.set('latitude', input.latitude.toString());
    searchParams.set('longitude', input.longitude.toString());
    searchParams.set('radiusKm', input.radiusKm.toString());
  }

  return apiRequest<GetCommunityReportsResponse>(`/reports/community?${searchParams.toString()}`, {
    accessToken: input.accessToken
  });
}

export function getCommunityReportById(reportId: string, accessToken: string) {
  return apiRequest<GetCommunityReportResponse>(`/reports/community/${reportId}`, {
    accessToken
  });
}
