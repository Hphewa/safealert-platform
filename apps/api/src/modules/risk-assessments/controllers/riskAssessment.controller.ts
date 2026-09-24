import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { RiskAssessmentService } from '../services/riskAssessment.service.js';
import { calculateRiskAssessmentSchema, createRiskAssessmentSchema, riskAssessmentIdSchema } from '../validation/riskAssessment.schemas.js';

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
  const getForReport: RequestHandler = asyncHandler(async (request, response) => {
    response.json(await service.getForReport(riskAssessmentIdSchema.parse(request.params.reportId)));
  });
  return { calculate, create, getById, getForReport };
}
