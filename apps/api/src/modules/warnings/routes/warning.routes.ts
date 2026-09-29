import { Router } from 'express';
import type { ApiConfig } from '../../../config/env.js';
import { authenticate } from '../../../middleware/authenticate.js';
import { authorizeRoles } from '../../../middleware/authorizeRoles.js';
import { createWarningController } from '../controllers/warning.controller.js';
import type { WarningService } from '../services/warning.service.js';
import { ResidentWarningService } from '../services/residentWarning.service.js';
import { WarningAcknowledgementModel } from '../models/warningAcknowledgement.model.js';
import { WarningModel } from '../models/warning.model.js';
import { UserModel } from '../../users/models/user.model.js';
import { WARNING_ACKNOWLEDGEMENT_RESPONSES, type WarningAcknowledgementsResponse } from '@safealert/contracts';
import { z } from 'zod';

export function createWarningRouter(service: WarningService, config: ApiConfig) {
  const router = Router();
  router.use(authenticate(config));
  const controller = createWarningController(service);
  const residentWarnings = new ResidentWarningService();
  const acknowledgementRequest = z.object({ response: z.enum(WARNING_ACKNOWLEDGEMENT_RESPONSES) });
  router.get('/', authorizeRoles('RESIDENT'), async (request, response, next) => {
    try { response.json(await residentWarnings.list(request.auth!.id)); } catch (error) { next(error); }
  });
  router.get('/by-assessment/:assessmentId', authorizeRoles('DISASTER_OFFICER'), controller.getByAssessment);
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
    try { response.json(await residentWarnings.acknowledge(request.auth!.id, request.params.warningId ?? '', acknowledgementRequest.parse(request.body))); } catch (error) { next(error); }
  });
  router.get('/:warningId/acknowledgements', authorizeRoles('DISASTER_OFFICER'), async (request, response, next) => {
    try {
      const warningId = request.params.warningId ?? '';
      const warning = await WarningModel.findById(warningId).select('_id').lean().exec();
      if (!warning) { response.status(404).json({ error: { code: 'WARNING_NOT_FOUND', message: 'Warning not found.' } }); return; }
      const records = await WarningAcknowledgementModel.find({ warningId }).sort({ acknowledgedAt: 1 }).lean().exec();
      const residentIds = records.map(record => record.residentId);
      const residents = await UserModel.find({ _id: { $in: residentIds } }).select('name phoneNumber area district country').lean().exec();
      const byId = new Map(residents.map(resident => [resident._id.toString(), resident]));
      const acknowledgements = records.filter(record => record.response).map(record => {
        const resident = byId.get(record.residentId.toString());
        return { warningId, residentId: record.residentId.toString(), response: record.response, acknowledgedAt: record.acknowledgedAt.toISOString(), resident: { name: resident?.name ?? 'Resident', ...(resident?.phoneNumber ? { phoneNumber: resident.phoneNumber } : {}), ...(resident?.area ? { area: resident.area } : {}), ...(resident?.district ? { district: resident.district } : {}), ...(resident?.country ? { country: resident.country } : {}) } };
      });
      const summary = acknowledgements.reduce((counts, item) => { counts.total += 1; if (item.response === 'SAFE') counts.safe += 1; else if (item.response === 'EVACUATING') counts.evacuating += 1; else counts.needAssistance += 1; return counts; }, { total: 0, safe: 0, evacuating: 0, needAssistance: 0 });
      response.json({ acknowledgements, summary } satisfies WarningAcknowledgementsResponse);
    } catch (error) { next(error); }
  });
  router.post('/', authorizeRoles('DISASTER_OFFICER'), controller.create);
  router.post('/:warningId/publish', authorizeRoles('DISASTER_OFFICER'), controller.publish);
  // LDFEW-115: lifecycle maintenance follows the same REST/auth style as publish.
  router.patch('/:warningId', authorizeRoles('DISASTER_OFFICER'), controller.update);
  router.post('/:warningId/cancel', authorizeRoles('DISASTER_OFFICER'), controller.cancel);
  router.post('/:warningId/archive', authorizeRoles('DISASTER_OFFICER'), controller.archive);
  return router;
}
