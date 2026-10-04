import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import {
  listAssignedResponderRequests,
  listCompletedResponderRequests,
  listPendingResponderRequests
} from './responderRequestsApi';

const responseRequest: SafeResponseRequest = {
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
  updatedAt: '2026-09-23T10:00:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Responder request API', () => {
  it('loads pending requests with the authenticated API client', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([responseRequest]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPendingResponderRequests('responder-access-token')).resolves.toEqual([
      responseRequest
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/response-requests/responder/pending`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer responder-access-token'
        })
      })
    );
  });

  it('loads assigned requests without sending a responder ID', async () => {
    const assignedRequest = { ...responseRequest, status: 'ASSIGNED' as const };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([assignedRequest]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAssignedResponderRequests('responder-access-token')).resolves.toEqual([
      assignedRequest
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/response-requests/responder/assigned`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer responder-access-token'
        })
      })
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('responderId');
  });

  it('preserves an empty queue as an empty array', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPendingResponderRequests('responder-access-token')).resolves.toEqual([]);
  });

  it('loads completed history with session authentication and no client-selected responder', async () => {
    const completed = { ...responseRequest, status: 'COMPLETED' as const, assignedResponderId: 'responder-1' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([completed]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listCompletedResponderRequests('responder-access-token')).resolves.toEqual([completed]);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/response-requests/responder/completed`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer responder-access-token' })
    }));
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('responderId');
  });

  it('surfaces a user-safe client error when the queue request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPendingResponderRequests('responder-access-token')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0
    });
  });

  it('ignores malformed queue records and rejects a malformed queue response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([responseRequest, { id: 'incomplete' }]))
      .mockResolvedValueOnce(jsonResponse({ requests: [responseRequest] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPendingResponderRequests('responder-access-token')).resolves.toEqual([
      responseRequest
    ]);
    await expect(listPendingResponderRequests('responder-access-token')).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE'
    });
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
