import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createWarningController } from '../controllers/warning.controller.js';
import type { WarningService } from '../services/warning.service.js';
import { ResidentWarningService } from '../services/residentWarning.service.js';

export function createWarningRouter(service: WarningService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config));
  const controller = createWarningController(service);
  const residentWarnings = new ResidentWarningService();
  router.get('/', authorizeRoles('RESIDENT'), async (request, response, next) => {
    try { response.json(await residentWarnings.list(request.auth!.id)); } catch (error) { next(error); }
  });
  router.get('/:warningId', authorizeRoles('RESIDENT', 'DISASTER_OFFICER'), async (request, response, next) => {
    try {
      if (request.auth!.role === 'DISASTER_OFFICER') {
        await controller.get(request, response, next);
        return;
      }
      response.json(await residentWarnings.get(request.auth!.id, request.params.warningId ?? ''));
    } catch (error) { next(error); }
  });
  router.post('/:warningId/acknowledge', authorizeRoles('RESIDENT'), async (request, response, next) => {
    try { response.json(await residentWarnings.acknowledge(request.auth!.id, request.params.warningId ?? '')); } catch (error) { next(error); }
  });
  router.post('/', authorizeRoles('DISASTER_OFFICER'), controller.create);
  router.post('/:warningId/publish', authorizeRoles('DISASTER_OFFICER'), controller.publish);
  return router;
}
