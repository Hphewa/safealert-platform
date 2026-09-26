import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { WarningService } from '../services/warning.service.js';
import { createWarningSchema } from '../validation/warning.schemas.js';

export function createWarningController(service: WarningService) {
  const create: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const { safeRoutes, attachments, ...required } = createWarningSchema.parse(request.body);
    response.status(201).json(await service.create(request.auth.id, {
      ...required, ...(safeRoutes ? { safeRoutes } : {}), ...(attachments ? { attachments } : {})
    }));
  });
  const publish: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const id = request.params.warningId ?? '';
    if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid warning ID is required.');
    response.json(await service.publish(request.auth.id, id));
  });
  const get: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const id = request.params.warningId ?? '';
    if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid warning ID is required.');
    const warning = await service.get(id);
    if (!warning) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    response.json({ warning });
  });
  return { create, publish, get };
}
