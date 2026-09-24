import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createWarningController } from '../controllers/warning.controller.js';
import type { WarningService } from '../services/warning.service.js';

export function createWarningRouter(service: WarningService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER'));
  router.post('/', createWarningController(service).create);
  return router;
}
