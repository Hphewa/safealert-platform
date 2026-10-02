import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { RiskMapService } from '../services/riskMap.service.js';

const querySchema = z.object({}).strict();
export function createRiskMapController(service: RiskMapService) {
  const list: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    querySchema.parse(request.query);
    response.set('Cache-Control', 'private, no-store');
    response.json(await service.list(request.auth.role));
  });
  return { list };
}
