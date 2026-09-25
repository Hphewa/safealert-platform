import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { IncidentService } from '../services/incident.service.js';
import { createIncidentSchema, incidentCandidateQuerySchema, incidentObjectIdSchema } from '../validation/incident.schemas.js';

export function createIncidentController(service: IncidentService) {
  const create: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const input = createIncidentSchema.parse(request.body);
    response.status(201).json(await service.create(request.auth.id, input));
  });

  const getById: RequestHandler = asyncHandler(async (request, response) => {
    const incidentId = incidentObjectIdSchema.parse(request.params.incidentId);
    response.json(await service.getById(incidentId));
  });

  const findCandidates: RequestHandler = asyncHandler(async (request, response) => {
    const { reportId } = incidentCandidateQuerySchema.parse(request.query);
    response.json(await service.findCandidates(reportId));
  });

  return { create, getById, findCandidates };
}
