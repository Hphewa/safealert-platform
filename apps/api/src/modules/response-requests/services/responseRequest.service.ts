import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse,
  GetResidentResponseRequestResponse,
  GetResidentResponseRequestsResponse,
  ResponseStatus,
  SafeUser,
  UserRole
} from '@safealert/contracts';
import { isValidResponseProgressTransition } from '@safealert/contracts';
import mongoose from 'mongoose';

import { ApiError } from '../../../shared/apiError.js';
import type { ResponseRequestRepository } from '../repositories/responseRequest.repository.js';

export type ResponderActionActor = {
  id: string;
  role: UserRole;
};

export class ResponseRequestService {
  constructor(private readonly repository: ResponseRequestRepository) {}

  async createResidentResponseRequest(
    residentId: string,
    input: CreateResponseRequestRequest
  ): Promise<CreateResponseRequestResponse> {
    const responseRequest = await this.repository.createResponseRequest({
      residentId,
      assistanceType: input.assistanceType,
      location: input.location,
      affectedPeople: input.affectedPeople,
      medicalNeeds: input.medicalNeeds,
      injuredPeople: input.injuredPeople,
      vulnerablePeople: input.vulnerablePeople,
      roadAccessibility: input.roadAccessibility,
      contact: input.contact,
      description: input.description,
      ...(input.specialRequirements ? { specialRequirements: input.specialRequirements } : {}),
      status: 'NEW'
    });

    return { responseRequest };
  }

  async listResidentResponseRequests(residentId: string): Promise<GetResidentResponseRequestsResponse> {
    this.requireResidentIdentity(residentId);

    return {
      responseRequests: await this.repository.findResponseRequestsByResidentId(residentId)
    };
  }

  async getResidentResponseRequestById(
    residentId: string,
    responseRequestId: string
  ): Promise<GetResidentResponseRequestResponse> {
    this.requireResidentIdentity(residentId);

    if (!mongoose.isObjectIdOrHexString(responseRequestId)) {
      throw new ApiError(400, 'INVALID_REQUEST_ID', 'A valid response request id is required.');
    }

    // Reuse the owner-scoped lookup without a status filter so tracking reads
    // the same persisted lifecycle and timestamps as responder operations.
    const responseRequest = await this.repository.findResponseRequestById(
      responseRequestId.toLowerCase(),
      residentId
    );

    if (!responseRequest) {
      // Do not reveal whether an inaccessible request belongs to another resident.
      throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Emergency request not found.');
    }

    return { responseRequest };
  }

  async cancelResidentResponseRequest(
    responseRequestId: string,
    actor: Pick<SafeUser, 'id' | 'role'> | null | undefined
  ): Promise<never> {
    if (!actor) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    if (actor.role !== 'RESIDENT') {
      throw new ApiError(403, 'FORBIDDEN', 'Only Residents can cancel emergency requests.');
    }

    // Reuse the existing validated, owner-scoped read instead of introducing an
    // unscoped lookup while cancellation-specific authorization awaits LDFEW-319.
    await this.getResidentResponseRequestById(actor.id, responseRequestId);

    // LDFEW-318 establishes the API flow only. Keep emergency history unchanged
    // until LDFEW-319/320/323 supply authorization, lifecycle policy and an atomic
    // CANCELLED status update. Never delete records or report an unpersisted success.
    throw new ApiError(
      501,
      'CANCELLATION_NOT_AVAILABLE',
      'Emergency request cancellation is not available yet. Your request has not been changed.'
    );
  }

  private requireResidentIdentity(residentId: string) {
    // Fail closed if an internal caller omits the authenticated ownership scope.
    if (typeof residentId !== 'string' || !residentId.trim()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }
  }

  async listPendingResponseRequests(responderId: string) {
    if (typeof responderId !== 'string' || !responderId.trim()) {
      throw new ApiError(400, 'INVALID_RESPONDER_ID', 'A responder id is required.');
    }

    return this.repository.findPendingResponseRequests(responderId.trim());
  }

  async listAssignedResponseRequests(responderId: string) {
    // A responder identity is required before querying assigned requests;
    // an empty ID could result in an invalid or unsafe queue lookup.
    if (typeof responderId !== 'string' || !responderId.trim()) {
      throw new ApiError(400, 'INVALID_RESPONDER_ID', 'A responder id is required.');
    }

    return this.repository.findAssignedResponseRequests(responderId.trim());
  }

  async acceptResponseRequest(
    responseRequestId: string,
    actor: ResponderActionActor | null | undefined
  ) {
    const responderId = this.validateResponderActionInput(responseRequestId, actor);

    const responseRequest = await this.repository.acceptResponseRequest(
      responseRequestId.trim(),
      responderId
    );

    if (!responseRequest) {
      throw new ApiError(
        409,
        'REQUEST_NOT_AVAILABLE',
        'This emergency request is no longer available.'
      );
    }

    return responseRequest;
  }

  async declineResponseRequest(
    responseRequestId: string,
    actor: ResponderActionActor | null | undefined
  ) {
    const responderId = this.validateResponderActionInput(responseRequestId, actor);

    const responseRequest = await this.repository.declineResponseRequest(
      responseRequestId.trim(),
      responderId
    );

    if (!responseRequest) {
      throw new ApiError(
        409,
        'REQUEST_NOT_AVAILABLE',
        'This emergency request is no longer available.'
      );
    }

    return responseRequest;
  }

  async updateResponseRequestProgress(
    responseRequestId: string,
    actor: ResponderActionActor | null | undefined,
    nextStatus: ResponseStatus
  ) {
    const responderId = this.validateResponderActionInput(responseRequestId, actor);

    if (!mongoose.isObjectIdOrHexString(responseRequestId)) {
      throw new ApiError(400, 'INVALID_REQUEST_ID', 'A valid response request id is required.');
    }

    const requestId = responseRequestId.toLowerCase();
    const responseRequest = await this.repository.findResponseRequestForProgress(requestId);

    if (!responseRequest) {
      throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Emergency request not found.');
    }

    if (responseRequest.assignedResponderId !== responderId) {
      throw new ApiError(
        403,
        'REQUEST_NOT_ASSIGNED',
        'Only the responder assigned to this request can update its progress.'
      );
    }

    // LDFEW-121 starts from ASSIGNED; NEW -> ASSIGNED belongs to LDFEW-130.
    if (!isValidResponseProgressTransition(responseRequest.status, nextStatus)) {
      throw new ApiError(
        409,
        'INVALID_PROGRESS_TRANSITION',
        `Cannot update emergency request progress from ${responseRequest.status} to ${nextStatus}.`
      );
    }

    const updatedRequest = await this.repository.updateResponseRequestProgress(
      requestId,
      responderId,
      responseRequest.status,
      nextStatus
    );

    if (!updatedRequest) {
      throw new ApiError(
        409,
        'REQUEST_PROGRESS_CONFLICT',
        'This request changed before progress could be updated. Refresh it and try again.'
      );
    }

    return updatedRequest;
  }

  private validateResponderActionInput(
    responseRequestId: string,
    actor: ResponderActionActor | null | undefined
  ) {
    if (typeof responseRequestId !== 'string' || !responseRequestId.trim()) {
      throw new ApiError(400, 'INVALID_REQUEST_ID', 'A response request id is required.');
    }

    if (!actor) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    if (actor.role !== 'EMERGENCY_RESPONDER') {
      throw new ApiError(403, 'FORBIDDEN', 'Only Emergency Responders can manage requests.');
    }

    if (typeof actor.id !== 'string' || !actor.id.trim()) {
      throw new ApiError(400, 'INVALID_RESPONDER_ID', 'A responder id is required.');
    }

    return actor.id.trim();
  }
}
