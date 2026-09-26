import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { RiskAssessmentService } from '../services/riskAssessment.service.js';
import {
  calculateRiskAssessmentSchema, closeRiskAssessmentSchema, createRiskAssessmentSchema, reassessRiskAssessmentSchema,
  riskAssessmentIdSchema
} from '../validation/riskAssessment.schemas.js';

export function createRiskAssessmentController(service: RiskAssessmentService) {
  const calculate: RequestHandler = asyncHandler(async (request, response) => {
    response.json(await service.calculate(calculateRiskAssessmentSchema.parse(request.body)));
  });
  const create: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    // Omit absent optional properties for strict shared contract compatibility.
    const { decisionReason, ...factors } = createRiskAssessmentSchema.parse(request.body);
    response.status(201).json(await service.create(request.auth.id, {
      ...factors, ...(decisionReason ? { decisionReason } : {})
    }));
  });
  const getById: RequestHandler = asyncHandler(async (request, response) => {
    response.json(await service.getById(riskAssessmentIdSchema.parse(request.params.assessmentId)));
  });
  const getForIncident: RequestHandler = asyncHandler(async (request, response) => {
    response.json(await service.getForIncident(riskAssessmentIdSchema.parse(request.params.incidentId)));
  });
  const reassess: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const { decisionReason, ...input } = reassessRiskAssessmentSchema.parse(request.body);
    response.status(201).json(await service.reassess(
      request.auth.id, riskAssessmentIdSchema.parse(request.params.assessmentId),
      { ...input, ...(decisionReason ? { decisionReason } : {}) }
    ));
  });
  const close: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    const assessmentId = riskAssessmentIdSchema.parse(request.params.assessmentId);
    const { closureNote, ...input } = closeRiskAssessmentSchema.parse(request.body);
    response.json(await service.close(request.auth.id, assessmentId, {
      ...input, ...(closureNote === undefined ? {} : { closureNote })
    }));
  });
  const getHistoryForIncident: RequestHandler = asyncHandler(async (request, response) => {
    response.json(await service.getHistoryForIncident(riskAssessmentIdSchema.parse(request.params.incidentId)));
  });
  return { calculate, create, reassess, close, getById, getForIncident, getHistoryForIncident };
}
