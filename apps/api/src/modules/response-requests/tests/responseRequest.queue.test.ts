import { describe, expect, it } from 'vitest';

import { ApiError } from '../../../shared/apiError.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import type {
  ResponderActionActor,
  ResponseRequestService
} from '../services/responseRequest.service.js';
import { ResponseRequestService as ResponseRequestServiceImplementation } from '../services/responseRequest.service.js';
import type { SafeResponseRequest } from '@safealert/contracts';

function createResponseRequest(overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
  return {
    id: 'request-1',
    residentId: 'resident-1',
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: {
      type: 'Point',
      coordinates: [79.8612, 6.9271]
    },
    affectedPeople: 2,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: {
      children: 0,
      elderlyPeople: 0,
      personsWithDisabilities: 0,
      pregnantPersons: 0
    },
    roadAccessibility: 'LIMITED',
    contact: {
      name: 'Resident User',
      phoneNumber: '+94-77-555-1234'
    },
    description: 'Assistance is needed at the reported location.',
    status: 'NEW',
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides
  };
}

function createService() {
  const repository = new InMemoryResponseRequestRepository();
  const service: ResponseRequestService = new ResponseRequestServiceImplementation(repository);

  return { repository, service };
}

const responderActor = (id = 'responder-a'): ResponderActionActor => ({
  id,
  role: 'EMERGENCY_RESPONDER'
});

describe('response request queue service', () => {
  it('returns only NEW requests newest first for the pending queue', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({ id: 'older-new', createdAt: '2026-09-23T09:00:00.000Z' })
    );
    repository.seedResponseRequest(
      createResponseRequest({ id: 'assigned', status: 'ASSIGNED', createdAt: '2026-09-23T11:00:00.000Z' })
    );
    repository.seedResponseRequest(
      createResponseRequest({ id: 'newer-new', createdAt: '2026-09-23T12:00:00.000Z' })
    );

    const requests = await service.listPendingResponseRequests();

    expect(requests.map((request) => request.id)).toEqual(['newer-new', 'older-new']);
  });

  it('returns only ASSIGNED requests belonging to the requested responder', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'responder-a-request',
        status: 'ASSIGNED',
        assignedResponderId: 'responder-a',
        createdAt: '2026-09-23T10:00:00.000Z'
      })
    );
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'responder-b-request',
        status: 'ASSIGNED',
        assignedResponderId: 'responder-b',
        createdAt: '2026-09-23T12:00:00.000Z'
      })
    );
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'new-request',
        status: 'NEW',
        createdAt: '2026-09-23T13:00:00.000Z'
      })
    );

    const requests = await service.listAssignedResponseRequests('responder-a');

    expect(requests.map((request) => request.id)).toEqual(['responder-a-request']);
  });

  it('returns an empty array when no requests match', async () => {
    const { service } = createService();

    await expect(service.listPendingResponseRequests()).resolves.toEqual([]);
    await expect(service.listAssignedResponseRequests('responder-a')).resolves.toEqual([]);
  });

  it.each(['', '   ', undefined])('rejects an invalid responder id: %j', async (responderId) => {
    const { service } = createService();

    await expect(
      service.listAssignedResponseRequests(responderId as unknown as string)
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ApiError &&
        error.statusCode === 400 &&
        error.code === 'INVALID_RESPONDER_ID'
    );
  });

  it('accepts a NEW request and assigns it to the authenticated responder', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'request-to-accept' }));

    const responseRequest = await service.acceptResponseRequest('request-to-accept', responderActor());

    expect(responseRequest).toEqual(
      expect.objectContaining({
        status: 'ASSIGNED',
        assignedResponderId: 'responder-a'
      })
    );
    await expect(service.listPendingResponseRequests()).resolves.toEqual([]);
    await expect(service.listAssignedResponseRequests('responder-a')).resolves.toEqual([
      expect.objectContaining({ id: 'request-to-accept' })
    ]);
  });

  it('rejects accepting a request that is no longer NEW', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({ id: 'already-assigned', status: 'ASSIGNED' })
    );

    await expect(
      service.acceptResponseRequest('already-assigned', responderActor())
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_NOT_AVAILABLE'
    });
  });

  it('declines a NEW request without changing its status', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'request-to-decline' }));

    const responseRequest = await service.declineResponseRequest('request-to-decline', responderActor());

    expect(responseRequest.status).toBe('NEW');
    expect(responseRequest.assignedResponderId).toBeUndefined();
    await expect(service.listPendingResponseRequests()).resolves.toEqual([
      expect.objectContaining({ id: 'request-to-decline', status: 'NEW' })
    ]);
  });

  it('rejects declining a missing or non-NEW request', async () => {
    const { service } = createService();

    await expect(
      service.declineResponseRequest('missing-request', responderActor())
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_NOT_AVAILABLE'
    });
    await expect(service.acceptResponseRequest('', responderActor())).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_REQUEST_ID'
    });
  });

  it('rejects unauthenticated and non-responder action actors', async () => {
    const { service } = createService();

    await expect(service.acceptResponseRequest('request-1', null)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED'
    });
    await expect(
      service.declineResponseRequest('request-1', { id: 'resident-1', role: 'RESIDENT' })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN'
    });
  });
});