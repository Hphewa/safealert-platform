import type {
  GetOfficerCommunityReportClusterResponse,
  GetOfficerCommunityReportClustersResponse
} from '@safealert/contracts';

import { apiRequest } from '../../../../services/api/client';

export function listOfficerCommunityReportClusters(accessToken: string) {
  return apiRequest<GetOfficerCommunityReportClustersResponse>('/report-clusters/officer/pending', {
    accessToken
  });
}

export function getOfficerCommunityReportCluster(clusterId: string, accessToken: string) {
  return apiRequest<GetOfficerCommunityReportClusterResponse>(
    `/report-clusters/officer/${encodeURIComponent(clusterId)}`,
    { accessToken }
  );
}

