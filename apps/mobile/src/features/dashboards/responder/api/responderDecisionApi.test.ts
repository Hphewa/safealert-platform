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
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}