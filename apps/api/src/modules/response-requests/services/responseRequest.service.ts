import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse,
  UserRole
} from '@safealert/contracts';

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

  async listPendingResponseRequests() {
    return this.repository.findPendingResponseRequests();
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
    this.validateResponderActionInput(responseRequestId, actor);

    const responseRequest = await this.repository.declineResponseRequest(responseRequestId.trim());

    if (!responseRequest) {
      throw new ApiError(
        409,
        'REQUEST_NOT_AVAILABLE',
        'This emergency request is no longer available.'
      );
    }

    return responseRequest;
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
