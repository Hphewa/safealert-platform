import type {
  CreateResponseRequestRequest,
  CreateResponseRequestResponse
} from '@safealert/contracts';

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
}
