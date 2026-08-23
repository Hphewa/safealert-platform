import type { CreateReportRequest } from '@safealert/contracts';
import type { RequestHandler } from 'express';

import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { ReportService } from '../services/report.service.js';
import {
  communityReportQuerySchema,
  createReportSchema,
  maxCommunityReportRadiusKm
} from '../validation/report.schemas.js';

export function createReportController(reportService: ReportService) {
  const create: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const parsedInput = createReportSchema.parse(request.body);
    const input: CreateReportRequest = {
      hazardType: parsedInput.hazardType,
      description: parsedInput.description,
      severity: parsedInput.severity,
      location: parsedInput.location,
      ...(parsedInput.mediaReference ? { mediaReference: parsedInput.mediaReference } : {})
    };
    const result = await reportService.createResidentReport(request.auth.id, input);

    response.status(201).json(result);
  });

  const listCommunity: RequestHandler = asyncHandler(async (request, response) => {
    const parsedQuery = communityReportQuerySchema.parse(request.query);
    const resolvedMode =
      parsedQuery.mode ??
      (parsedQuery.latitude !== undefined || parsedQuery.longitude !== undefined ? 'nearby' : 'incoming');

    const result =
      resolvedMode === 'nearby' && parsedQuery.latitude !== undefined && parsedQuery.longitude !== undefined
        ? await reportService.listCommunityReportsForVolunteer({
            mode: 'nearby',
            latitude: parsedQuery.latitude,
            longitude: parsedQuery.longitude,
            radiusKm: parsedQuery.radiusKm ?? maxCommunityReportRadiusKm
          })
        : await reportService.listCommunityReportsForVolunteer({
            mode: 'incoming'
          });

    response.status(200).json(result);
  });

  return {
    create,
    listCommunity
  };
}


