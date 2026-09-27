import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiBaseUrl } from '../../../services/api/client';
import { clearPushToken, getNotificationProfile, registerPushToken, updateNotificationProfile } from './notificationApi';

const profile = {
  area: 'riversidevillage',
  district: 'colombo',
  country: 'srilanka',
  phoneNumber: '0771234567',
  pushToken: 'fcm-token-from-device'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Notification profile API client', () => {
  it('reads the authenticated notification profile', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ profile }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNotificationProfile('resident-token')).resolves.toEqual({ profile });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/notifications/profile`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' },
      body: undefined
    });
  });

  it('registers the device FCM token for the authenticated resident', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ profile }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(registerPushToken('fcm-token-from-device', 'resident-token')).resolves.toEqual({ profile });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${apiBaseUrl}/notifications/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer resident-token' },
      body: JSON.stringify({ pushToken: 'fcm-token-from-device' })
    });
  });

  it('clears the device token by sending a null value', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ profile: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await clearPushToken('resident-token');

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ pushToken: null }));
  });

  it('updates contact details without ever sending targeting or identity fields', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ profile }));
    vi.stubGlobal('fetch', fetchMock);

    await updateNotificationProfile({ area: 'Riverside Village', phoneNumber: '0771234567' }, 'resident-token');

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ area: 'Riverside Village', phoneNumber: '0771234567' })
    );
  });

  it('surfaces a server validation failure', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: { code: 'VALIDATION_ERROR', message: 'Enter a valid Sri Lankan mobile number such as 0771234567.' }
    }, 400)));

    const failure = await registerPushToken('fcm-token', 'resident-token').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiClientError);
    expect(failure).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('reports a network failure with a reachable-API message', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));

    await expect(registerPushToken('fcm-token', 'resident-token')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR'
    });
  });
});