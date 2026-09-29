import crypto from 'node:crypto';

import { RESPONSE_ACTIVE_ASSIGNED_STATUSES, RESPONSE_CANCELLABLE_STATUS, RESPONSE_EDITABLE_STATUS, type ResponseStatus, type SafeResponseRequest, type UpdateResponseRequestRequest } from '@safealert/contracts';
import { residentEditableFields, responseProgressTimestampFields } from './responseRequest.repository.js';

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
      declinedByResponderIds: [],
      createdAt: now,
      updatedAt: now
    };

    if (input.specialRequirements) {
      responseRequest.specialRequirements = input.specialRequirements;
    }

    this.responseRequests.set(responseRequest.id, responseRequest);
    return responseRequest;
  }

  async updateResidentResponseRequest(responseRequestId: string, residentId: string, input: UpdateResponseRequestRequest) {
    const current = this.responseRequests.get(responseRequestId);
    if (!current || current.residentId !== residentId || current.status !== RESPONSE_EDITABLE_STATUS) {
      return null;
    }
    // No await between the predicate and replacement, matching the MongoDB write.
    const fields = residentEditableFields(input);
    const updated = { ...current, ...fields, updatedAt: new Date().toISOString() };
    if (!fields.specialRequirements) delete updated.specialRequirements;
    this.responseRequests.set(responseRequestId, updated);
    return updated;
  }

  async findResponseRequestsByResidentId(residentId: string) {
    return [...this.responseRequests.values()]
      .filter((responseRequest) => responseRequest.residentId === residentId)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
      );
  }

  async findPendingResponseRequests(responderId: string) {
    // Mirror the MongoDB queue rules so service tests exercise the same
    // filtering and ordering behavior used in production.
    return [...this.responseRequests.values()]
      // NEW requests are waiting to be handled by an Emergency Responder.
      .filter(
        (responseRequest) =>
          responseRequest.status === 'NEW' &&
          !(responseRequest.declinedByResponderIds ?? []).includes(responderId)
      )
      // Show the newest requests first while priority scoring is unavailable.
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findAssignedResponseRequests(responderId: string) {
    // Restrict the assigned queue to the responder's own active workload.
    return [...this.responseRequests.values()]
      .filter(
        (responseRequest) =>
          RESPONSE_ACTIVE_ASSIGNED_STATUSES.some((status) => status === responseRequest.status) &&
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
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.responseRequests.set(responseRequestId, assignedResponseRequest);

    return assignedResponseRequest;
  }

  async declineResponseRequest(responseRequestId: string, responderId: string) {
    const responseRequest = this.responseRequests.get(responseRequestId);

    if (!responseRequest || responseRequest.status !== 'NEW') {
      return null;
    }

    // A decline leaves the request NEW so another responder can accept it,
    // while the set prevents the same responder being recorded twice.
    const declinedByResponderIds = new Set(responseRequest.declinedByResponderIds ?? []);
    declinedByResponderIds.add(responderId);
    const updatedResponseRequest: SafeResponseRequest = {
      ...responseRequest,
      declinedByResponderIds: [...declinedByResponderIds]
    };
    this.responseRequests.set(responseRequestId, updatedResponseRequest);

    return updatedResponseRequest;
  }

  async findResponseRequestForCancellation(responseRequestId: string) {
    return this.responseRequests.get(responseRequestId) ?? null;
  }

  async cancelResponseRequest(responseRequestId: string, residentId: string) {
    const responseRequest = this.responseRequests.get(responseRequestId);
    if (!responseRequest || responseRequest.residentId !== residentId || responseRequest.status !== RESPONSE_CANCELLABLE_STATUS) {
      return null;
    }

    // No await between checking and replacing: mirror the conditional MongoDB write.
    const cancelledAt = new Date().toISOString();
    const updatedRequest: SafeResponseRequest = {
      ...responseRequest,
      status: 'CANCELLED',
      cancelledAt,
      updatedAt: cancelledAt
    };
    this.responseRequests.set(responseRequestId, updatedRequest);
    return updatedRequest;
  }

  async findResponseRequestForProgress(responseRequestId: string) {
    return this.responseRequests.get(responseRequestId) ?? null;
  }

  // LDFEW-266: In-memory simulation of atomic responder field update
  async updateResponseRequestFieldUpdate(
    responseRequestId: string,
    responderId: string,
    fieldNotes: string
  ) {
    const responseRequest = this.responseRequests.get(responseRequestId);

    // Enforce responder assignment and active assigned statuses
    if (
      !responseRequest ||
      responseRequest.assignedResponderId !== responderId ||
      !RESPONSE_ACTIVE_ASSIGNED_STATUSES.some((status) => status === responseRequest.status)
    ) {
      return null;
    }

    const occurredAt = new Date().toISOString();
    const updatedRequest: SafeResponseRequest = {
      ...responseRequest,
      fieldNotes: fieldNotes.trim(),
      fieldUpdatedAt: occurredAt,
      updatedAt: occurredAt
    };
    this.responseRequests.set(responseRequestId, updatedRequest);
    return updatedRequest;
  }

  async updateResponseRequestProgress(
    responseRequestId: string,
    responderId: string,
    currentStatus: ResponseStatus,
    nextStatus: ResponseStatus,
    completionDetails?: {
      assistanceProvided: string;
      completionSummary: string;
      responderRemarks?: string;
    }
  ) {
    const responseRequest = this.responseRequests.get(responseRequestId);
    const timestampField = responseProgressTimestampFields[nextStatus];

    if (
      !responseRequest ||
      !timestampField ||
      responseRequest.assignedResponderId !== responderId ||
      responseRequest.status !== currentStatus
    ) {
      return null;
    }

    const occurredAt = new Date().toISOString();
    const updatedRequest: SafeResponseRequest = {
      ...responseRequest,
      status: nextStatus,
      [timestampField]: occurredAt,
      // LDFEW-266: Persist validated completion details alongside completedAt timestamp
      ...(nextStatus === 'COMPLETED' && completionDetails ? {
        assistanceProvided: completionDetails.assistanceProvided.trim(),
        completionSummary: completionDetails.completionSummary.trim(),
        ...(completionDetails.responderRemarks?.trim() ? { responderRemarks: completionDetails.responderRemarks.trim() } : {})
      } : {}),
      updatedAt: occurredAt
    };
    this.responseRequests.set(responseRequestId, updatedRequest);
    return updatedRequest;
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
