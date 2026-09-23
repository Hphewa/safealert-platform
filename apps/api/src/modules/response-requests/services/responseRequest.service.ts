import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse
} from '@safealert/contracts';

import { ApiError } from '../../../shared/apiError.js';
import type { ResponseRequestRepository } from '../repositories/responseRequest.repository.js';

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
}
