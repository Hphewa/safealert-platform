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
  findPendingResponseRequests(): Promise<SafeResponseRequest[]>;
  findAssignedResponseRequests(responderId: string): Promise<SafeResponseRequest[]>;
  findResponseRequestById(
    responseRequestId: string,
    residentId: string,
    statuses?: ResponseStatus[]
  ): Promise<SafeResponseRequest | null>;
}
