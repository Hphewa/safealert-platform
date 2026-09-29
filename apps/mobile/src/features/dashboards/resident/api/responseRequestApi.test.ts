import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SafeResponseRequest } from '@safealert/contracts';

import { apiBaseUrl } from '../../../../services/api/client';
import {
  cancelResidentResponseRequest,
  getMyResponseRequestById,
  listMyResponseRequests,
  updateResidentResponseRequest
} from './responseRequestApi';

afterEach(() => vi.unstubAllGlobals());

describe('confirmed Resident emergency request cancellation API', () => {
  const requestId = '507f1f77bcf86cd799439011';
  const cancelledRequest: SafeResponseRequest = {
    id: requestId, residentId: 'resident-1', status: 'CANCELLED', assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 1, injuredPeople: 0, medicalNeeds: true,
    vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'ACCESSIBLE', contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
    description: 'Assistance needed.', createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z'
  };

  it('PATCHes only the normalized request ID with the existing bearer token', async () => {
    const response = { responseRequest: cancelledRequest };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);
    await expect(cancelResidentResponseRequest(requestId.toUpperCase(), 'resident-token')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/${requestId}/cancel`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' }, body: undefined
    });
  });

  it.each(['', 'bad-id', '../other', `${requestId}?ownerId=other`])('rejects an invalid target before transport: %s', async (id) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(cancelResidentResponseRequest(id, 'resident-token')).rejects.toMatchObject({ code: 'INVALID_REQUEST_ID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not submit without authentication', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(cancelResidentResponseRequest(requestId, ' ')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { responseRequest: null }, { responseRequest: { id: requestId, status: 'NEW' } },
    { responseRequest: { id: '507f1f77bcf86cd799439012', status: 'CANCELLED' } }])(
    'does not claim cancellation succeeded for malformed response %j', async (response) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
      await expect(cancelResidentResponseRequest(requestId, 'resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );

  it.each([401, 403, 404, 409, 500])('preserves backend rejection (%s) without retrying the mutation', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: { code: 'CANCELLATION_REJECTED', message: 'Request unavailable.' } }, { status }
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(cancelResidentResponseRequest(requestId, 'resident-token')).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['residentId', 'assistanceType', 'location', 'affectedPeople', 'injuredPeople', 'medicalNeeds',
    'vulnerablePeople', 'roadAccessibility', 'contact', 'description', 'createdAt', 'updatedAt'] as const)(
    'rejects cancellation success missing required %s data', async (field) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
        responseRequest: { ...cancelledRequest, [field]: undefined }
      })));
      await expect(cancelResidentResponseRequest(requestId, 'resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );
});

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

  it.each([null, 'invalid', {}, { id: 'invalid-id' }])('rejects malformed list entries: %j', async (entry) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ responseRequests: [entry] })));
    await expect(listMyResponseRequests('resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('accepts identified requests with missing optional presentation data', async () => {
    const response = { responseRequests: [{ id: '507f1f77bcf86cd799439011' }] };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
    expect(await listMyResponseRequests('resident-token')).toEqual(response);
  });

  it('rejects an absent response body instead of treating it as an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(listMyResponseRequests('resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('preserves authentication failures from the shared client', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Token expired' } }, { status: 401 }
    )));
    await expect(listMyResponseRequests('expired-token')).rejects.toMatchObject({ status: 401 });
  });
});

describe('resident single emergency request API', () => {
  const requestId = '507f1f77bcf86cd799439011';

  it('uses the owner-scoped endpoint and existing bearer token with only the selected ID', async () => {
    const response = { responseRequest: { id: requestId } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getMyResponseRequestById(requestId.toUpperCase(), 'resident-token')).toEqual(response);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/mine/${requestId}`, {
      method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' },
      body: undefined
    });
  });

  it.each(['', '   ', '../another-request', '507f1f77bcf86cd799439011?residentId=other'])('rejects malformed IDs before fetching: %s', async (id) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMyResponseRequestById(id, 'resident-token')).rejects.toMatchObject({ code: 'INVALID_REQUEST_ID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch without a token', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMyResponseRequestById(requestId, ' ')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { responseRequest: null }, { responseRequest: { id: '507f1f77bcf86cd799439012' } }])(
    'rejects missing or mismatched response data: %j', async (response) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
      await expect(getMyResponseRequestById(requestId, 'resident-token')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );

  it.each([401, 403, 404])('preserves a secure endpoint rejection (%s) without returning request data', async (status) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: { code: 'REQUEST_NOT_AVAILABLE', message: 'Unavailable' } }, { status }
    )));
    await expect(getMyResponseRequestById(requestId, 'resident-token')).rejects.toMatchObject({ status });
  });
});

describe('resident update emergency request API', () => {
  const requestId = '507f1f77bcf86cd799439011';
  const updatePayload = {
    assistanceType: 'MEDICAL_ASSISTANCE' as const,
    location: { type: 'Point' as const, coordinates: [79.8612, 6.9271] as [number, number] },
    affectedPeople: 2,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'LIMITED' as const,
    contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
    description: 'Updated assistance details.'
  };

  it('PATCHes the owner-scoped mine endpoint with payload and existing token', async () => {
    const response = { responseRequest: { id: requestId, ...updatePayload } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);

    expect(await updateResidentResponseRequest(requestId.toUpperCase(), updatePayload, 'resident-token')).toEqual(response);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/response-requests/mine/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' },
      body: JSON.stringify(updatePayload)
    });
  });

  it.each(['', '  ', 'invalid-id', '../attack', `${requestId}?residentId=other`])(
    'rejects malformed target request ID before transport: %s',
    async (id) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);
      await expect(updateResidentResponseRequest(id, updatePayload, 'resident-token')).rejects.toMatchObject({
        code: 'INVALID_REQUEST_ID'
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('does not send request without authentication', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateResidentResponseRequest(requestId, updatePayload, ' ')).rejects.toMatchObject({
      status: 401
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { responseRequest: null }, { responseRequest: { id: '507f1f77bcf86cd799439012' } }])(
    'rejects missing or mismatched response data: %j',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
      await expect(updateResidentResponseRequest(requestId, updatePayload, 'resident-token')).rejects.toMatchObject({
        code: 'INVALID_RESPONSE'
      });
    }
  );

  it.each([400, 401, 403, 404, 409, 500])(
    'preserves backend error status (%s) without modifying request state',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(
          Response.json({ error: { code: 'UPDATE_FAILED', message: 'Failed' } }, { status })
        )
      );
      await expect(updateResidentResponseRequest(requestId, updatePayload, 'resident-token')).rejects.toMatchObject({
        status
      });
    }
  );
});

