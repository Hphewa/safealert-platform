import crypto from 'node:crypto';

import type { ResponseStatus, SafeResponseRequest } from '@safealert/contracts';

import type {
  CreateResponseRequestInput,
  ResponseRequestRepository
} from './responseRequest.repository.js';

export class InMemoryResponseRequestRepository implements ResponseRequestRepository {
  private readonly responseRequests = new Map<string, SafeResponseRequest>();

  async createResponseRequest(input: CreateResponseRequestInput): Promise<SafeResponseRequest> {
    const now = new Date().toISOString();
    const responseRequest: SafeResponseRequest = {
      id: crypto.randomUUID(),
      residentId: input.residentId,
      assistanceType: input.assistanceType,
      location: input.location,
      affectedPeople: input.affectedPeople,
      medicalNeeds: input.medicalNeeds,
      injuredPeople: input.injuredPeople,
      vulnerablePeople: input.vulnerablePeople,
      roadAccessibility: input.roadAccessibility,
      contact: input.contact,
      description: input.description,
      status: input.status,
      createdAt: now,
      updatedAt: now
    };

    if (input.specialRequirements) {
      responseRequest.specialRequirements = input.specialRequirements;
    }

    this.responseRequests.set(responseRequest.id, responseRequest);
    return responseRequest;
  }

  async findPendingResponseRequests() {
    // Mirror the MongoDB queue rules so service tests exercise the same
    // filtering and ordering behavior used in production.
    return [...this.responseRequests.values()]
      // NEW requests are waiting to be handled by an Emergency Responder.
      .filter((responseRequest) => responseRequest.status === 'NEW')
      // Show the newest requests first while priority scoring is unavailable.
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findAssignedResponseRequests(responderId: string) {
    // Restrict the assigned queue to the responder's own active workload.
    return [...this.responseRequests.values()]
      .filter(
        (responseRequest) =>
          responseRequest.status === 'ASSIGNED' &&
          responseRequest.assignedResponderId === responderId
      )
          // Keep ordering consistent with the production repository.
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async acceptResponseRequest(responseRequestId: string, responderId: string) {
    const responseRequest = this.responseRequests.get(responseRequestId);

    if (!responseRequest || responseRequest.status !== 'NEW') {
      return null;
    }

    // Mirror the atomic NEW-only production transition in the test repository.
    const assignedResponseRequest: SafeResponseRequest = {
      ...responseRequest,
      status: 'ASSIGNED',
      assignedResponderId: responderId,
      updatedAt: new Date().toISOString()
    };
    this.responseRequests.set(responseRequestId, assignedResponseRequest);

    return assignedResponseRequest;
  }

  async declineResponseRequest(responseRequestId: string) {
    const responseRequest = this.responseRequests.get(responseRequestId);

    if (!responseRequest || responseRequest.status !== 'NEW') {
      return null;
    }

    // A decline leaves the request NEW so another responder can accept it.
    return responseRequest;
  }

  async findResponseRequestById(
    responseRequestId: string,
    residentId: string,
    statuses?: ResponseStatus[]
  ) {
    const responseRequest = this.responseRequests.get(responseRequestId);

    if (!responseRequest || responseRequest.residentId !== residentId) {
      return null;
    }

    if (statuses?.length && !statuses.includes(responseRequest.status)) {
      return null;
    }

    return responseRequest;
  }

  seedResponseRequest(responseRequest: SafeResponseRequest) {
    this.responseRequests.set(responseRequest.id, responseRequest);
  }
}
