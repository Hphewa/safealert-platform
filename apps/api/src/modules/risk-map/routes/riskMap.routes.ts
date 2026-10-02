import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createRiskMapController } from '../controllers/riskMap.controller.js';
import type { RiskMapService } from '../services/riskMap.service.js';

export function createRiskMapRouter(service: RiskMapService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER', 'EMERGENCY_RESPONDER', 'COMMUNITY_VOLUNTEER', 'RESIDENT'));
  router.get('/', createRiskMapController(service).list);
  return router;
}
