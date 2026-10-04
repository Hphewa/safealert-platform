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
  router.get('/mine', authenticate(config), authorizeRoles('RESIDENT'), controller.listMine);
  router.patch(
    '/mine/:requestId',
    authenticate(config),
    authorizeRoles('RESIDENT'),
    controller.updateMineById
  );
  router.get(
    '/mine/:requestId',
    authenticate(config),
    authorizeRoles('RESIDENT'),
    controller.getMineById
  );
  router.patch(
    '/:requestId/cancel',
    authenticate(config),
    authorizeRoles('RESIDENT'),
    controller.cancelForResident
  );
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
  router.get(
    '/responder/completed',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.listCompletedForResponder
  );
  // LDFEW-266 / LDFEW-355: Emergency Responder retrieves request details by ID to view previously saved updates
  router.get(
    '/responder/requests/:requestId',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.getResponderRequestById
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

  router.patch(
    '/:requestId/progress',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.updateProgress
  );

  // LDFEW-266 / LDFEW-350: Assigned Emergency Responder records operational field updates
  router.patch(
    '/:requestId/field-update',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.recordFieldUpdate
  );
  router.patch(
    '/responder/requests/:requestId/field-update',
    authenticate(config),
    authorizeRoles('EMERGENCY_RESPONDER'),
    controller.recordFieldUpdate
  );

  return router;
}
