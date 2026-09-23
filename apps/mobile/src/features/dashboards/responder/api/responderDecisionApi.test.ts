import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import { acceptResponderRequest, declineResponderRequest } from './responderDecisionApi';

const responseRequest = {
  id: 'request/one',
  status: 'ASSIGNED'
} as SafeResponseRequest;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Responder decision API', () => {
  it('accepts a request using the authenticated API client', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(responseRequest));
    vi.stubGlobal('fetch', fetchMock);

    await expect(acceptResponderRequest('request/one', 'responder-token')).resolves.toEqual(
      responseRequest
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/response-requests/responder/requests/request%2Fone/accept`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer responder-token' }),
        body: undefined
      })
    );
  });

  it('declines a request without sending a responder ID', async () => {
    const declinedRequest = { ...responseRequest, status: 'NEW' as const };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(declinedRequest));
    vi.stubGlobal('fetch', fetchMock);

    await expect(declineResponderRequest('request/one', 'responder-token')).resolves.toEqual(
      declinedRequest
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('responderId');
  });

  it.each([401, 403, 404, 409, 500])('propagates API status %s for friendly screen handling', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'REQUEST_NOT_AVAILABLE', message: 'Request unavailable.' } }), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(declineResponderRequest('request/one', 'responder-token')).rejects.toMatchObject({
      status,
      code: 'REQUEST_NOT_AVAILABLE'
    });
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}