import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createCommunityReportClusterController } from '../controllers/communityReportCluster.controller.js';
import type { CommunityReportGroupingService } from '../services/communityReportGrouping.service.js';

export function createCommunityReportClusterRouter(
  service: CommunityReportGroupingService,
  config: ApiConfig
) {
  const router = Router();
  const controller = createCommunityReportClusterController(service);

  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER'));
  router.get('/officer/pending', controller.listOfficerClusters);
  router.get('/officer/history', controller.listOfficerClusterHistory);
  router.get('/officer/:clusterId', controller.getOfficerCluster);

  return router;
}

