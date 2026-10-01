import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createIncidentController } from '../controllers/incident.controller.js';
import type { IncidentService } from '../services/incident.service.js';
import type { IncidentLifecycleService } from '../services/incidentLifecycle.service.js';

export function createIncidentRouter(service: IncidentService, lifecycle: IncidentLifecycleService, config: ApiConfig) {
  const router = Router();
  const controller = createIncidentController(service, lifecycle);
  router.use(authenticate(config), authorizeRoles('DISASTER_OFFICER'));
  router.post('/', controller.create);
  router.get('/active', controller.listActive);
  router.get('/assessment-queue', controller.listInitialAssessmentQueue);
  router.get('/monitoring', controller.listMonitoring);
  router.get('/monitoring/:incidentId', controller.getMonitoringDetail);
  router.get('/:incidentId/timeline', controller.getTimeline);
  router.get('/candidates', controller.findCandidates);
  router.post('/:incidentId/reports', controller.addReport);
  router.get('/:incidentId/reports', controller.getDetails);
  router.get('/:incidentId', controller.getById);
  return router;
}
