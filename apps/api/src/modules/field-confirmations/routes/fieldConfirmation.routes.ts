import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { FieldConfirmationService } from '../services/fieldConfirmation.service.js';
import { confirmSchema, reportIdSchema, unableToConfirmSchema } from '../validation/fieldConfirmation.schemas.js';

export function createFieldConfirmationRouter(service: FieldConfirmationService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config));
  router.get('/mine', authorizeRoles('COMMUNITY_VOLUNTEER'), asyncHandler(async (request, response) => {
    response.json(await service.listForVolunteer(request.auth!.id));
  }));
  router.post('/:reportId/confirm', authorizeRoles('COMMUNITY_VOLUNTEER'), asyncHandler(async (request, response) => {
    const reportId = reportIdSchema.parse(request.params.reportId);
    const input = confirmSchema.parse(request.body);
    response.status(201).json(await service.submit(reportId, request.auth!.id, {
      outcome: 'CONFIRMED',
      verificationChecklist: input.verificationChecklist,
      ...(input.observation ? { observation: input.observation } : {}),
      ...(input.mediaReference ? { mediaReference: input.mediaReference } : {})
    }));
  }));
  router.post('/:reportId/unable-to-confirm', authorizeRoles('COMMUNITY_VOLUNTEER'), asyncHandler(async (request, response) => {
    const reportId = reportIdSchema.parse(request.params.reportId);
    const input = unableToConfirmSchema.parse(request.body);
    response.status(201).json(await service.submit(reportId, request.auth!.id, {
      outcome: 'UNABLE_TO_CONFIRM', reason: input.reason,
      ...(input.reasonDetails ? { reasonDetails: input.reasonDetails } : {})
    }));
  }));
  router.get('/:reportId', authorizeRoles('DISASTER_OFFICER'), asyncHandler(async (request, response) => {
    response.json(await service.listForOfficer(reportIdSchema.parse(request.params.reportId)));
  }));
  return router;
}
