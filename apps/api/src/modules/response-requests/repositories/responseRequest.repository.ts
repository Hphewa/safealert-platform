import type {
  CreateResponseRequestRequest,
  ResponseStatus,
  SafeResponseRequest,
  UpdateResponseRequestRequest
} from '@safealert/contracts';

export type CreateResponseRequestInput = CreateResponseRequestRequest & {
  residentId: string;
  status: 'NEW';
  clientOperationId?: string;
};

// Explicitly select editable fields even for internal callers: never spread a
// client object into storage where it could replace ownership or responder data.
export function residentEditableFields(input: UpdateResponseRequestRequest): UpdateResponseRequestRequest {
  return {
    assistanceType: input.assistanceType,
    location: { type: 'Point', coordinates: [...input.location.coordinates] },
    affectedPeople: input.affectedPeople,
    medicalNeeds: input.medicalNeeds,
    injuredPeople: input.injuredPeople,
    vulnerablePeople: {
      children: input.vulnerablePeople.children,
      elderlyPeople: input.vulnerablePeople.elderlyPeople,
      personsWithDisabilities: input.vulnerablePeople.personsWithDisabilities,
      pregnantPersons: input.vulnerablePeople.pregnantPersons
    },
    roadAccessibility: input.roadAccessibility,
    contact: {
      name: input.contact.name,
      phoneNumber: input.contact.phoneNumber,
      ...(input.contact.email ? { email: input.contact.email } : {})
    },
    description: input.description,
    ...(input.specialRequirements ? { specialRequirements: input.specialRequirements } : {})
  };
}

// acceptedAt is owned by LDFEW-130; progress writes only the stage being entered.
export const responseProgressTimestampFields: Partial<Record<
  ResponseStatus,
  'dispatchedAt' | 'arrivedAt' | 'inProgressAt' | 'completedAt'
>> = {
  DISPATCHED: 'dispatchedAt',
  ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'inProgressAt',
  COMPLETED: 'completedAt'
};

export interface ResponseRequestRepository {
  createResponseRequest(input: CreateResponseRequestInput): Promise<SafeResponseRequest>;
  findResponseRequestByClientOperationId(residentId: string, clientOperationId: string): Promise<SafeResponseRequest | null>;
  updateResidentResponseRequest(
    responseRequestId: string,
    residentId: string,
    input: UpdateResponseRequestRequest
  ): Promise<SafeResponseRequest | null>;
  findResponseRequestsByResidentId(residentId: string): Promise<SafeResponseRequest[]>;
  findPendingResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findAssignedResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findCompletedResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findResponseRequestForCancellation(responseRequestId: string): Promise<SafeResponseRequest | null>;
  cancelResponseRequest(responseRequestId: string, residentId: string): Promise<SafeResponseRequest | null>;
  findResponseRequestForProgress(responseRequestId: string): Promise<SafeResponseRequest | null>;
  // LDFEW-266: Persist responder field notes with server-recorded fieldUpdatedAt timestamp
  updateResponseRequestFieldUpdate(
    responseRequestId: string,
    responderId: string,
    fieldNotes: string
  ): Promise<SafeResponseRequest | null>;
  updateResponseRequestProgress(
    responseRequestId: string,
    responderId: string,
    currentStatus: ResponseStatus,
    nextStatus: ResponseStatus,
    completionDetails?: {
      assistanceProvided: string;
      completionSummary: string;
      responderRemarks?: string;
    }
  ): Promise<SafeResponseRequest | null>;
  acceptResponseRequest(
    responseRequestId: string,
    responderId: string
  ): Promise<SafeResponseRequest | null>;
  declineResponseRequest(
    responseRequestId: string,
    responderId: string
  ): Promise<SafeResponseRequest | null>;
  findResponseRequestById(
    responseRequestId: string,
    residentId: string,
    statuses?: ResponseStatus[]
  ): Promise<SafeResponseRequest | null>;
}
