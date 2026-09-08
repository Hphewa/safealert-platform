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
}
