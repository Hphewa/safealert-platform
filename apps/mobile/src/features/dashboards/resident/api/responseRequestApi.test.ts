import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import { listMyResponseRequests } from './responseRequestApi';

afterEach(() => vi.unstubAllGlobals());

describe('resident emergency request API', () => {
  it('uses the authenticated mine endpoint without sending an ownership ID', async () => {
    const response = { responseRequests: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    expect(await listMyResponseRequests('resident-token')).toEqual(response);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/mine`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' },
      body: undefined
    });
  });

  it('does not send an unauthenticated request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(listMyResponseRequests(' ')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { responseRequests: null }])('rejects missing list data: %j', async (response) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
    await expect(listMyResponseRequests('resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('preserves authentication failures from the shared client', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Token expired' } }, { status: 401 }
    )));
    await expect(listMyResponseRequests('expired-token')).rejects.toMatchObject({ status: 401 });
  });
});
