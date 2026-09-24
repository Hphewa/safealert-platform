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
  return { create };
}
