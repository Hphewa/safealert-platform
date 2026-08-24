import { Router } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createReportController } from '../controllers/report.controller.js';
import type { ReportService } from '../services/report.service.js';

export function createReportRouter(reportService: ReportService, config: ApiConfig) {
  const router = Router();
  const controller = createReportController(reportService);

  router.post('/', authenticate(config), authorizeRoles('RESIDENT'), controller.create);
  router.get(
    '/community',
    authenticate(config),
    authorizeRoles('COMMUNITY_VOLUNTEER'),
    controller.listCommunity
  );
  router.get(
    '/community/:reportId',
    authenticate(config),
    authorizeRoles('COMMUNITY_VOLUNTEER'),
    controller.getCommunityById
  );
  router.get(
    '/officer/pending',
    authenticate(config),
    authorizeRoles('DISASTER_OFFICER'),
    controller.listPendingOfficerReports
  );
  router.get(
    '/officer/:reportId',
    authenticate(config),
    authorizeRoles('DISASTER_OFFICER'),
    controller.getPendingOfficerReportById
  );
  router.patch(
    '/:reportId/verification',
    authenticate(config),
    authorizeRoles('DISASTER_OFFICER'),
    controller.review
  );

  return router;
}
