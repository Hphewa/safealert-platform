import type {
  CreateResponseRequestRequest,
  ResponseStatus,
  SafeResponseRequest
} from '@safealert/contracts';

export type CreateResponseRequestInput = CreateResponseRequestRequest & {
  residentId: string;
  status: 'NEW';
};

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
  findResponseRequestsByResidentId(residentId: string): Promise<SafeResponseRequest[]>;
  findPendingResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findAssignedResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findResponseRequestForCancellation(responseRequestId: string): Promise<SafeResponseRequest | null>;
  findResponseRequestForProgress(responseRequestId: string): Promise<SafeResponseRequest | null>;
  updateResponseRequestProgress(
    responseRequestId: string,
    responderId: string,
    currentStatus: ResponseStatus,
    nextStatus: ResponseStatus
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
