import type { RequestHandler } from 'express';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { CommunityReportGroupingService } from '../services/communityReportGrouping.service.js';
import { communityReportClusterObjectIdSchema } from '../validation/communityReportCluster.schemas.js';

export function createCommunityReportClusterController(service: CommunityReportGroupingService) {
  const listOfficerClusters: RequestHandler = asyncHandler(async (_request, response) => {
    response.json(await service.listOfficerClusters());
  });

  const getOfficerCluster: RequestHandler = asyncHandler(async (request, response) => {
    const clusterId = communityReportClusterObjectIdSchema.parse(request.params.clusterId);
    response.json(await service.getOfficerCluster(clusterId));
  });

  return { listOfficerClusters, getOfficerCluster };
}

