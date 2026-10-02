import type { CreateResponseRequestRequest } from '@safealert/contracts';
import type { RequestHandler } from 'express';

import { ApiError } from '../../../shared/apiError.js';
import { asyncHandler } from '../../../shared/asyncHandler.js';
import type { ResponseRequestService } from '../services/responseRequest.service.js';
import {
  cancelResponseRequestSchema,
  createResponseRequestSchema,
  updateResponseRequestSchema,
  responseRequestProgressSchema,
  recordFieldUpdateSchema,
  responderRequestParamsSchema
} from '../validation/responseRequest.schemas.js';

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
    const clientOperationId = request.get('Idempotency-Key')?.trim();
    const result = await responseRequestService.createResidentResponseRequest(
      request.auth.id, input, clientOperationId || undefined
    );

    response.status(201).json(result);
  });

  const listMine: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    // Client-supplied resident IDs must never determine the ownership scope.
    response.status(200).json(await responseRequestService.listResidentResponseRequests(request.auth.id));
  });

  const getMineById: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    response.status(200).json(await responseRequestService.getResidentResponseRequestById(
      request.auth.id,
      request.params.requestId ?? ''
    ));
  });

  const updateMineById: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const { params, body } = updateResponseRequestSchema.parse({
      params: request.params,
      body: request.body,
      query: request.query
    });
    const { contact, specialRequirements, ...fields } = body;
    // Ownership comes exclusively from the verified session, never the edit form.
    response.status(200).json(await responseRequestService.updateResidentResponseRequest(
      params.requestId, request.auth, {
        ...fields,
        contact: {
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          ...(contact.email ? { email: contact.email } : {})
        },
        ...(specialRequirements ? { specialRequirements } : {})
      }
    ));
  });

  const cancelForResident: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const { params } = cancelResponseRequestSchema.parse({
      params: request.params,
      body: request.body,
      query: request.query
    });

    // Derive the actor from the verified session, never from client-supplied user IDs.
    // asyncHandler forwards failures to the existing sanitized API error handler.
    const result = await responseRequestService.cancelResidentResponseRequest(params.requestId, request.auth);
    response.status(200).json(result);
  });

  const listPendingForResponder: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const responseRequests = await responseRequestService.listPendingResponseRequests(
      request.auth.id
    );

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

  const listCompletedForResponder: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }
    // Ignore owner/status overrides in client input; history is always the verified actor's completed work.
    response.status(200).json(await responseRequestService.listCompletedResponseRequests(request.auth.id));
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

  // LDFEW-266 / LDFEW-350: Assigned Emergency Responder records operational field notes.
  // Responder identity is derived strictly from the authenticated token session (request.auth);
  // a client cannot submit another responder's ID in the body or URL to update their assignment.
  // Input allowlisting via recordFieldUpdateSchema ensures only the fieldNotes property is
  // accepted, rejecting extraneous or forbidden fields in request.body before invoking the service.
  const recordFieldUpdate: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const { params, body } = recordFieldUpdateSchema.parse({
      params: request.params,
      body: request.body,
      query: request.query
    });

    // Delegate business rules, ownership checks, and lifecycle verification to the service layer.
    const responseRequest = await responseRequestService.recordFieldUpdate(
      params.requestId,
      request.auth,
      body.fieldNotes
    );

    response.status(200).json(responseRequest);
  });

  const updateProgress: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const parsed = responseRequestProgressSchema.parse(request.body);
    // LDFEW-266 / LDFEW-353: Extract completion details when completing the request
    const completionDetails = parsed.status === 'COMPLETED'
      ? {
          ...(parsed.assistanceProvided !== undefined ? { assistanceProvided: parsed.assistanceProvided } : {}),
          ...(parsed.completionSummary !== undefined ? { completionSummary: parsed.completionSummary } : {}),
          ...(parsed.responderRemarks !== undefined ? { responderRemarks: parsed.responderRemarks } : {})
        }
      : undefined;

    const responseRequest = await responseRequestService.updateResponseRequestProgress(
      request.params.requestId ?? '',
      request.auth,
      parsed.status,
      completionDetails
    );

    response.status(200).json(responseRequest);
  });

  // LDFEW-266 / LDFEW-355: Responder retrieves emergency request details by ID to view previously saved updates
  const getResponderRequestById: RequestHandler = asyncHandler(async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const { params } = responderRequestParamsSchema.parse({
      params: request.params,
      query: request.query
    });

    const responseRequest = await responseRequestService.getResponderResponseRequestById(
      params.requestId,
      request.auth
    );

    response.status(200).json(responseRequest);
  });

  return {
    create,
    listMine,
    getMineById,
    updateMineById,
    cancelForResident,
    listPendingForResponder,
    listAssignedForResponder,
    listCompletedForResponder,
    getResponderRequestById,
    acceptForResponder,
    declineForResponder,
    updateProgress,
    recordFieldUpdate
  };
}
