import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createRiskAssessmentController } from '../controllers/riskAssessment.controller.js';
import type { RiskAssessmentService } from '../services/riskAssessment.service.js';

export function createRiskAssessmentRouter(service: RiskAssessmentService, config: ApiConfig) {
  const router = Router();
  const controller = createRiskAssessmentController(service);
  // Every read and write is an official officer operation for this milestone.
  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER'));
  router.post('/calculate', controller.calculate);
  router.post('/', controller.create);
  router.post('/:assessmentId/reassess', controller.reassess);
  router.patch('/:assessmentId/close', controller.close);
  router.patch('/:assessmentId/delete', controller.softDelete);
  router.get('/incident/:incidentId/history', controller.getHistoryForIncident);
  router.get('/incident/:incidentId', controller.getForIncident);
  router.get('/:assessmentId', controller.getById);
  return router;
}
