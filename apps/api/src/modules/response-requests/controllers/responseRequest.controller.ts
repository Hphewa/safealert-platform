import type { CreateResponseRequestRequest } from '@safealert/contracts';
import type { RequestHandler } from 'express';

import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { ResponseRequestService } from '../services/responseRequest.service.js';
import { createResponseRequestSchema } from '../validation/responseRequest.schemas.js';

export function createResponseRequestController(responseRequestService: ResponseRequestService) {
  const create: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const parsedInput = createResponseRequestSchema.parse(request.body);
    const input: CreateResponseRequestRequest = {
      assistanceType: parsedInput.assistanceType,
      location: parsedInput.location,
      affectedPeople: parsedInput.affectedPeople,
      medicalNeeds: parsedInput.medicalNeeds,
      injuredPeople: parsedInput.injuredPeople,
      vulnerablePeople: parsedInput.vulnerablePeople,
      roadAccessibility: parsedInput.roadAccessibility,
      contact: {
        name: parsedInput.contact.name,
        phoneNumber: parsedInput.contact.phoneNumber,
        ...(parsedInput.contact.email ? { email: parsedInput.contact.email } : {})
      },
      description: parsedInput.description,
      ...(parsedInput.specialRequirements
        ? { specialRequirements: parsedInput.specialRequirements }
        : {})
    };
    const result = await responseRequestService.createResidentResponseRequest(request.auth.id, input);

    response.status(201).json(result);
  });

  const listPendingForResponder: RequestHandler = asyncHandler(async (_request, response) => {
    const responseRequests = await responseRequestService.listPendingResponseRequests();

    response.status(200).json(responseRequests);
  });

  const listAssignedForResponder: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    // Use the authenticated responder identity rather than a client-supplied ID
    // to prevent access to another responder's assigned requests.
    const responseRequests = await responseRequestService.listAssignedResponseRequests(
      request.auth.id
    );

    response.status(200).json(responseRequests);
  });

  const acceptForResponder: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    // Pass the authenticated actor to the service so the client cannot spoof
    // which responder is accepting the emergency request.
    const responseRequest = await responseRequestService.acceptResponseRequest(
      request.params.requestId ?? '',
      request.auth
    );

    response.status(200).json(responseRequest);
  });

  const declineForResponder: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    // Business rules remain in the service; this controller only supplies the
    // route ID and authenticated actor to keep the endpoint thin.
    const responseRequest = await responseRequestService.declineResponseRequest(
      request.params.requestId ?? '',
      request.auth
    );

    response.status(200).json(responseRequest);
  });

  return {
    create,
    listPendingForResponder,
    listAssignedForResponder,
    acceptForResponder,
    declineForResponder
  };
}
