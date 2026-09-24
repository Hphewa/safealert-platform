import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiBaseUrl } from '../../../../services/api/client';
import { updateResponderRequestProgress, type ResponderProgressStatus } from './responderProgressApi';

const responseRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011',
  residentId: 'resident-1',
  assignedResponderId: 'responder-1',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'LIMITED',
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Medical transport is needed.',
  status: 'DISPATCHED',
  acceptedAt: '2026-09-24T10:00:00.000Z',
  dispatchedAt: '2026-09-24T10:01:00.000Z',
  createdAt: '2026-09-24T09:59:00.000Z',
  updatedAt: '2026-09-24T10:01:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Responder progress API', () => {
  it.each([
    ['DISPATCHED', 'dispatchedAt'],
    ['ARRIVED', 'arrivedAt'],
    ['IN_PROGRESS', 'inProgressAt'],
    ['COMPLETED', 'completedAt']
  ] as const)('updates to %s and returns the server request including %s', async (status, timestampField) => {
    const updatedRequest = { ...responseRequest, status, [timestampField]: responseRequest.updatedAt };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(updatedRequest));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateResponderRequestProgress(responseRequest.id, status, 'responder-token'))
      .resolves.toEqual(updatedRequest);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `${apiBaseUrl}/response-requests/${responseRequest.id}/progress`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer responder-token' },
        body: JSON.stringify({ status })
      }
    );
  });

  it('trims and encodes the request ID as one path segment', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ...responseRequest, id: 'request/one?x=1' }));
    vi.stubGlobal('fetch', fetchMock);

    await updateResponderRequestProgress(' request/one?x=1 ', 'DISPATCHED', 'responder-token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${apiBaseUrl}/response-requests/request%2Fone%3Fx%3D1/progress`);
  });

  it.each(['', '   ', null, undefined, 42])('rejects invalid request ID %s before fetching', async (requestId) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateResponderRequestProgress(requestId as string, 'DISPATCHED', 'token'))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST_ID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['NEW', 'ASSIGNED', 'INVALID', 'dispatched', '', null, undefined, 42])(
    'rejects unsupported status %s before fetching', async (status) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);

      await expect(updateResponderRequestProgress(responseRequest.id, status as ResponderProgressStatus, 'token'))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_STATUS' });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('rejects an absent access token before fetching', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', ''))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'UNAUTHORIZED', 'Please log in again'],
    [403, 'FORBIDDEN', 'permission'],
    [403, 'REQUEST_NOT_ASSIGNED', 'assigned'],
    [404, 'REQUEST_NOT_FOUND', 'could not be found'],
    [409, 'INVALID_PROGRESS_TRANSITION', 'not allowed'],
    [409, 'REQUEST_PROGRESS_CONFLICT', 'has changed'],
    [400, 'INVALID_REQUEST_ID', 'ID is invalid'],
    [400, 'VALIDATION_ERROR', 'update is invalid'],
    [500, 'INTERNAL_SERVER_ERROR', 'Unable to confirm'],
    [503, 'SERVICE_UNAVAILABLE', 'Unable to confirm']
  ] as const)('preserves HTTP %s / %s with a friendly message', async (status, code, message) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: { code, message: 'Raw internal server detail' }
    }, status));
    vi.stubGlobal('fetch', fetchMock);

    const error = await updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', 'token').catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status, code, message: expect.stringContaining(message) });
    expect((error as ApiClientError).message).not.toContain('Raw internal');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports network failure without exposing internal URLs or retrying the mutation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Internal network details'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', 'token')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to confirm progress. Check your connection and refresh the request before trying again.'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    {},
    { responseRequest },
    { ...responseRequest, id: 'another-request' },
    { ...responseRequest, status: 'ARRIVED' },
    { ...responseRequest, assignedResponderId: undefined },
    { ...responseRequest, dispatchedAt: undefined },
    { ...responseRequest, dispatchedAt: 'invalid-date' },
    { ...responseRequest, acceptedAt: 123 },
    { ...responseRequest, updatedAt: null },
    { ...responseRequest, location: { type: 'Point', coordinates: ['bad', 0] } },
    { ...responseRequest, contact: null },
    { ...responseRequest, vulnerablePeople: {} },
    { ...responseRequest, medicalNeeds: 'yes' },
    { ...responseRequest, affectedPeople: -1 },
    { ...responseRequest, assistanceType: 'INVALID' },
    { ...responseRequest, roadAccessibility: 'INVALID' }
  ])('rejects malformed or mismatched success data: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body)));

    await expect(updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', 'token'))
      .rejects.toMatchObject({ code: 'INVALID_API_RESPONSE', message: expect.stringContaining('Refresh') });
  });

  it.each([200, 204, 502])('handles an empty or non-JSON HTTP %s response', async (status) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(
      status === 204 ? null : '<html>Unexpected response</html>', { status }
    )));

    await expect(updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', 'token'))
      .rejects.toMatchObject({ code: status === 502 ? 'API_ERROR' : 'INVALID_API_RESPONSE' });
  });

  it('keeps its promise pending until the server responds so callers can manage loading', async () => {
    let completeFetch!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => {
      completeFetch = resolve;
    })));
    let settled = false;
    const pending = updateResponderRequestProgress(responseRequest.id, 'DISPATCHED', 'token');
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    completeFetch(jsonResponse(responseRequest));
    await expect(pending).resolves.toEqual(responseRequest);
    expect(settled).toBe(true);
  });
});
