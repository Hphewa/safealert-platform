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
      phoneNumber: '0775551234'
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

    const requests = await service.listPendingResponseRequests('responder-a');

    expect(requests.map((request) => request.id)).toEqual(['newer-new', 'older-new']);
  });

  it('excludes only requests declined by the current responder', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'declined-by-a',
        declinedByResponderIds: ['responder-a']
      })
    );
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'declined-by-b',
        declinedByResponderIds: ['responder-b']
      })
    );
    repository.seedResponseRequest(createResponseRequest({ id: 'not-declined' }));

    const responderARequests = await service.listPendingResponseRequests('responder-a');
    const responderBRequests = await service.listPendingResponseRequests('responder-b');

    expect(responderARequests.map((request) => request.id)).toEqual(['declined-by-b', 'not-declined']);
    expect(responderBRequests.map((request) => request.id)).toEqual(['declined-by-a', 'not-declined']);
  });

  it('accepts pending requests with no decline history', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'legacy-new-request' }));

    await expect(service.listPendingResponseRequests('responder-a')).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-new-request' })
    ]);
  });

  it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const)(
    'returns only the current responder\'s active %s requests, newest first', async (status) => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'responder-a-request',
        status,
        assignedResponderId: 'responder-a',
        createdAt: '2026-09-23T10:00:00.000Z'
      })
    );
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'responder-b-request',
        status,
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
    repository.seedResponseRequest(createResponseRequest({
      id: 'completed-request', status: 'COMPLETED', assignedResponderId: 'responder-a'
    }));
    repository.seedResponseRequest(createResponseRequest({ id: 'unassigned-request', status }));
    repository.seedResponseRequest(createResponseRequest({
      id: 'newer-own-request', status, assignedResponderId: 'responder-a',
      createdAt: '2026-09-23T14:00:00.000Z'
    }));

    const requests = await service.listAssignedResponseRequests('responder-a');

    expect(requests.map((request) => request.id)).toEqual(['newer-own-request', 'responder-a-request']);
    expect(requests.every((request) => request.status === status)).toBe(true);
  });

  it('returns an empty array when no requests match', async () => {
    const { service } = createService();

    await expect(service.listPendingResponseRequests('responder-a')).resolves.toEqual([]);
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

  it('rejects a pending queue lookup without a responder ID', async () => {
    const { service } = createService();

    await expect(
      service.listPendingResponseRequests('' as string)
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_RESPONDER_ID'
    });
  });

  it('accepts a NEW request and assigns it to the authenticated responder', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'request-to-accept' }));

    const responseRequest = await service.acceptResponseRequest('request-to-accept', responderActor());

    expect(responseRequest).toEqual(
      expect.objectContaining({
        status: 'ASSIGNED',
        assignedResponderId: 'responder-a',
        acceptedAt: expect.any(String)
      })
    );
    await expect(service.listPendingResponseRequests('responder-a')).resolves.toEqual([]);
    await expect(service.listAssignedResponseRequests('responder-a')).resolves.toEqual([
      expect.objectContaining({ id: 'request-to-accept' })
    ]);
  });

  it('rejects accepting a request that is no longer NEW', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'already-assigned',
        status: 'ASSIGNED',
        assignedResponderId: 'responder-b'
      })
    );

    await expect(
      service.acceptResponseRequest('already-assigned', responderActor())
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_NOT_AVAILABLE'
    });
    await expect(service.listAssignedResponseRequests('responder-b')).resolves.toEqual([
      expect.objectContaining({ id: 'already-assigned', assignedResponderId: 'responder-b' })
    ]);
  });

  it('allows only the first of two responders to accept the same NEW request', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'shared-new-request' }));

    const results = await Promise.allSettled([
      service.acceptResponseRequest('shared-new-request', responderActor('responder-a')),
      service.acceptResponseRequest('shared-new-request', responderActor('responder-b'))
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]).toEqual(
      expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({ status: 'ASSIGNED' })
      })
    );
    expect(rejected[0]).toEqual(
      expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          statusCode: 409,
          code: 'REQUEST_NOT_AVAILABLE'
        })
      })
    );
  });

  it('declines a NEW request without changing its status', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'request-to-decline' }));

    const responseRequest = await service.declineResponseRequest('request-to-decline', responderActor());

    expect(responseRequest.status).toBe('NEW');
    expect(responseRequest.assignedResponderId).toBeUndefined();
    expect(responseRequest.declinedByResponderIds).toEqual(['responder-a']);
    // The request remains NEW for other responders but is excluded from this
    // responder's pending queue after the decline is recorded.
    await expect(service.listPendingResponseRequests('responder-a')).resolves.toEqual([]);
    await expect(service.listPendingResponseRequests('responder-b')).resolves.toEqual([
      expect.objectContaining({
        id: 'request-to-decline',
        status: 'NEW',
        declinedByResponderIds: ['responder-a']
      })
    ]);
  });

  it('does not change an existing assignment when recording a decline', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(
      createResponseRequest({
        id: 'request-with-assignment',
        status: 'NEW',
        assignedResponderId: 'existing-responder'
      })
    );

    const responseRequest = await service.declineResponseRequest(
      'request-with-assignment',
      responderActor('declining-responder')
    );

    expect(responseRequest.status).toBe('NEW');
    expect(responseRequest.assignedResponderId).toBe('existing-responder');
    expect(responseRequest.declinedByResponderIds).toEqual(['declining-responder']);
  });

  it('stores multiple unique responder decline IDs without changing NEW status', async () => {
    const { repository, service } = createService();
    repository.seedResponseRequest(createResponseRequest({ id: 'shared-request' }));

    await service.declineResponseRequest('shared-request', responderActor('responder-a'));
    const secondDecline = await service.declineResponseRequest(
      'shared-request',
      responderActor('responder-b')
    );
    const duplicateDecline = await service.declineResponseRequest(
      'shared-request',
      responderActor('responder-a')
    );

    expect(secondDecline.declinedByResponderIds).toEqual(['responder-a', 'responder-b']);
    expect(duplicateDecline.declinedByResponderIds).toEqual(['responder-a', 'responder-b']);
    expect(duplicateDecline.status).toBe('NEW');
  });

  it('rejects declining a missing or non-NEW request', async () => {
    const { service } = createService();

    await expect(
      service.acceptResponseRequest('missing-request', responderActor())
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_NOT_AVAILABLE'
    });
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
