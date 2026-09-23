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
  // Responder queue data is operational emergency information and is restricted
  // to authenticated Emergency Responders by the shared middleware.
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
  // Keep authorization at the route boundary so only Emergency Responders
  // can perform responder decision actions on operational request data.
  router.patch(
    '/responder/requests/:requestId/accept',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.acceptForResponder
  );
  router.patch(
    '/responder/requests/:requestId/decline',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.declineForResponder
  );

  return router;
}
