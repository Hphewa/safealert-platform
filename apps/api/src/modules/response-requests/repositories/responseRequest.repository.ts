import type {
  CreateResponseRequestRequest,
  ResponseStatus,
  SafeResponseRequest
} from '@safealert/contracts';

export type CreateResponseRequestInput = CreateResponseRequestRequest & {
  residentId: string;
  status: 'NEW';
};

export interface ResponseRequestRepository {
  createResponseRequest(input: CreateResponseRequestInput): Promise<SafeResponseRequest>;
  findPendingResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findAssignedResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
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
