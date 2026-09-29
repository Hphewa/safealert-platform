import type { SafeResponseRequest } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiBaseUrl } from '../../../../services/api/client';
import {
  fieldUpdateErrorMessage,
  saveResponderFieldUpdate
} from './responderFieldUpdateApi';

const mockRequest: SafeResponseRequest = {
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
  updatedAt: '2026-09-24T10:01:00.000Z',
  fieldNotes: 'On route via secondary bypass due to water logging.',
  fieldUpdatedAt: '2026-09-24T10:02:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('saveResponderFieldUpdate', () => {
  it('sends PATCH to field-update endpoint and returns updated SafeResponseRequest', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(mockRequest));
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveResponderFieldUpdate(
      mockRequest.id,
      'On route via secondary bypass due to water logging.',
      'valid-token'
    );

    expect(result).toEqual(mockRequest);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/response-requests/${mockRequest.id}/field-update`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token'
        },
        body: JSON.stringify({ fieldNotes: 'On route via secondary bypass due to water logging.' })
      }
    );
  });

  it('rejects empty or whitespace requestId before sending fetch', async () => {
    await expect(saveResponderFieldUpdate('', 'valid notes', 'valid-token'))
      .rejects.toThrow('Select an emergency request to update.');

    await expect(saveResponderFieldUpdate('   ', 'valid notes', 'valid-token'))
      .rejects.toThrow('Select an emergency request to update.');
  });

  it('rejects notes under 3 characters before sending fetch', async () => {
    await expect(saveResponderFieldUpdate(mockRequest.id, 'ab', 'valid-token'))
      .rejects.toThrow('Field update notes must be at least 3 characters.');
  });

  it('rejects notes over 2000 characters before sending fetch', async () => {
    await expect(saveResponderFieldUpdate(mockRequest.id, 'a'.repeat(2001), 'valid-token'))
      .rejects.toThrow('Field update notes must be at most 2000 characters.');
  });

  it('rejects missing or empty access token before sending fetch', async () => {
    await expect(saveResponderFieldUpdate(mockRequest.id, 'valid notes', ''))
      .rejects.toThrow('Please log in again to update this request.');
  });

  it('maps 403 REQUEST_NOT_ASSIGNED error accurately', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 'REQUEST_NOT_ASSIGNED', message: 'Not assigned' } }, 403)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveResponderFieldUpdate(mockRequest.id, 'valid notes', 'valid-token'))
      .rejects.toThrow('Only the responder assigned to this request can record field updates.');
  });

  it('maps 409 INVALID_REQUEST_STATUS error accurately', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_REQUEST_STATUS', message: 'Invalid status' } }, 409)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveResponderFieldUpdate(mockRequest.id, 'valid notes', 'valid-token'))
      .rejects.toThrow('Field updates cannot be recorded on this request in its current status.');
  });

  it('throws INVALID_API_RESPONSE when server returns malformed response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ wrong: 'format' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveResponderFieldUpdate(mockRequest.id, 'valid notes', 'valid-token'))
      .rejects.toThrow('Unable to confirm the saved field update. Refresh the request before trying again.');
  });
});

describe('fieldUpdateErrorMessage', () => {
  it('maps various HTTP status codes to friendly user messages', () => {
    expect(fieldUpdateErrorMessage(new ApiClientError(401, 'UNAUTHORIZED', ''))).toBe('Please log in again to update this request.');
    expect(fieldUpdateErrorMessage(new ApiClientError(404, 'NOT_FOUND', ''))).toBe('This emergency request could not be found. Refresh your requests.');
    expect(fieldUpdateErrorMessage(new ApiClientError(0, 'NETWORK_ERROR', ''))).toBe('Unable to save field update. Check your connection and try again.');
  });
});
