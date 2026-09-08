import type { CreateReportRequest } from '@safealert/contracts';
import type { RequestHandler } from 'express';

import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { ReportService } from '../services/report.service.js';
import {
  communityReportQuerySchema,
  createReportSchema,
  maxCommunityReportRadiusKm,
  reportReviewActionSchema
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

  const getCommunityById: RequestHandler = asyncHandler(async (request, response) => {
    const reportId = request.params.reportId;

    if (!reportId) {
      throw new ApiError(400, 'INVALID_REPORT_ID', 'Report id is required.');
    }

    const result = await reportService.getCommunityReportForVolunteer(reportId);

    response.status(200).json(result);
  });

  const listPendingOfficerReports: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const result = await reportService.listPendingReportsForOfficer();

    response.status(200).json(result);
  });

  const getPendingOfficerReportById: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const reportId = request.params.reportId;

    if (!reportId) {
      throw new ApiError(400, 'INVALID_REPORT_ID', 'Report id is required.');
    }

    const result = await reportService.getPendingReportForOfficer(reportId);

    response.status(200).json(result);
  });

  const review: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const reportId = request.params.reportId;

    if (!reportId) {
      throw new ApiError(400, 'INVALID_REPORT_ID', 'Report id is required.');
    }

    const parsedReview = reportReviewActionSchema.parse(request.body);

    const result = await reportService.reviewReport(reportId, request.auth.id, parsedReview);

    response.status(200).json(result);
  });

  return {
    create,
    listCommunity,
    getCommunityById,
    listPendingOfficerReports,
    getPendingOfficerReportById,
    review
  };
}


