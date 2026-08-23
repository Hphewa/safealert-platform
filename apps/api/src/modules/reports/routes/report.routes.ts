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

  return router;
}
