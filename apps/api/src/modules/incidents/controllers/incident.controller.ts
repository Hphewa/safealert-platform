import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { IncidentService } from '../services/incident.service.js';
import type { IncidentLifecycleService } from '../services/incidentLifecycle.service.js';
import {
  addIncidentReportSchema,
  createIncidentSchema,
  incidentCandidateQuerySchema,
  incidentObjectIdSchema
} from '../validation/incident.schemas.js';

export function createIncidentController(service: IncidentService, lifecycle: IncidentLifecycleService) {
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

  const addReport: RequestHandler = asyncHandler(async (request, response) => {
    const incidentId = incidentObjectIdSchema.parse(request.params.incidentId);
    const { reportId } = addIncidentReportSchema.parse(request.body);
    response.json(await service.addReport(incidentId, reportId));
  });

  const getDetails: RequestHandler = asyncHandler(async (request, response) => {
    const incidentId = incidentObjectIdSchema.parse(request.params.incidentId);
    response.json(await service.getDetails(incidentId));
  });

  const listActive: RequestHandler = asyncHandler(async (_request, response) => {
    response.json(await service.listActive());
  });

  const listInitialAssessmentQueue: RequestHandler = asyncHandler(async (_request, response) => {
    response.json(await lifecycle.listInitialAssessmentQueue());
  });

  const listMonitoring: RequestHandler = asyncHandler(async (_request, response) => {
    response.json(await lifecycle.listMonitoring());
  });

  const getMonitoringDetail: RequestHandler = asyncHandler(async (request, response) => {
    const incidentId = incidentObjectIdSchema.parse(request.params.incidentId);
    response.json(await lifecycle.getMonitoringDetail(incidentId));
  });

  return { create, getById, findCandidates, addReport, getDetails, listActive,
    listInitialAssessmentQueue, listMonitoring, getMonitoringDetail };
}
