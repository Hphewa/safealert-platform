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
  const details: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    if (!/^[a-f\d]{24}$/i.test(request.params.incidentId ?? '')) {
      throw new ApiError(400, 'INVALID_INCIDENT_ID', 'A valid incident id is required.');
    }
    const detail = await service.getRiskLocationDetails(request.params.incidentId!, request.auth.role);
    response.set('Cache-Control', 'private, no-store');
    response.json({ role: request.auth.role, generatedAt: new Date().toISOString(), detail });
  });
  return { list, details };
}
