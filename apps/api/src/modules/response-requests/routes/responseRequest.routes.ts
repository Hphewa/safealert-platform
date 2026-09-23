import { Router } from 'express';

import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createResponseRequestController } from '../controllers/responseRequest.controller.js';
import type { ResponseRequestService } from '../services/responseRequest.service.js';

export function createResponseRequestRouter(
  responseRequestService: ResponseRequestService,
  config: ApiConfig
) {
  const router = Router();
  const controller = createResponseRequestController(responseRequestService);

  router.post('/', authenticate(config), authorizeRoles('RESIDENT'), controller.create);
  router.get(
    '/responder/pending',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.listPendingForResponder
  );
  router.get(
    '/responder/assigned',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.listAssignedForResponder
  );

  return router;
}
