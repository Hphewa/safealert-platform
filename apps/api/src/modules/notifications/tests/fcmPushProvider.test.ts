import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FcmPushProvider } from '../providers/fcmPushProvider.js';

const registeredKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const serviceAccount = {
  projectId: 'safealert-demo',
  clientEmail: 'safealert-demo@appspot.gserviceaccount.com',
  privateKey: registeredKeys.privateKey
};
const pushRequest = {
  token: 'device-token-a',
  title: 'SAFEALERT - HIGH WARNING',
  body: 'Riverside village\nFlood water is rising near homes.\nMove to the community hall.',
  data: { warningId: '507f1f77bcf86cd799439111', riskLevel: 'HIGH', affectedArea: 'Riverside village' }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Firebase Cloud Messaging push provider', () => {
  it('reports missing Firebase credentials as not configured and never calls FCM', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new FcmPushProvider({ projectId: undefined, clientEmail: undefined, privateKey: undefined }, fetchMock);

    expect(provider.isConfigured()).toBe(false);
    await expect(provider.send(pushRequest)).resolves.toEqual({
      status: 'FAILED',
      provider: 'FCM',
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      errorMessage: 'Firebase Cloud Messaging credentials are not configured on the server.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints a signed service-account token and sends the documented v1 message', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ name: 'projects/safealert-demo/messages/1234' }));
    const provider = new FcmPushProvider(serviceAccount, fetchMock);

    const result = await provider.send(pushRequest);

    expect(result).toEqual({
      status: 'SENT',
      provider: 'FCM',
      providerStatus: 'OK',
      providerMessageId: 'projects/safealert-demo/messages/1234'
    });

    const tokenCall = fetchMock.mock.calls[0] ?? [];
    expect(tokenCall[0]).toBe('https://oauth2.googleapis.com/token');
    expect(tokenCall[1]?.method).toBe('POST');
    const tokenBody = new URLSearchParams(String(tokenCall[1]?.body));
    expect(tokenBody.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const segments = (tokenBody.get('assertion') ?? '').split('.');
    expect(segments).toHaveLength(3);
    expect(JSON.parse(Buffer.from(segments[0] ?? '', 'base64url').toString('utf8')))
      .toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(segments[1] ?? '', 'base64url').toString('utf8'))).toMatchObject({
      iss: serviceAccount.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token'
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${segments[0]}.${segments[1]}`);
    expect(verifier.verify(registeredKeys.publicKey, Buffer.from(segments[2] ?? '', 'base64url'))).toBe(true);

    const sendCall = fetchMock.mock.calls[1] ?? [];
    expect(sendCall[0]).toBe('https://fcm.googleapis.com/v1/projects/safealert-demo/messages:send');
    expect((sendCall[1]?.headers as unknown as Record<string, string>).Authorization).toBe('Bearer access-token-1');
    expect(JSON.parse(String(sendCall[1]?.body))).toEqual({
      message: {
        token: pushRequest.token,
        notification: { title: pushRequest.title, body: pushRequest.body },
        data: pushRequest.data
      }
    });
  });

  it('accepts a service-account key with escaped newlines and caches the access token', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ name: 'projects/safealert-demo/messages/1' }))
      .mockResolvedValueOnce(jsonResponse({ name: 'projects/safealert-demo/messages/2' }));
    const provider = new FcmPushProvider({
      ...serviceAccount,
      privateKey: registeredKeys.privateKey.replace(/\n/g, '\\n')
    }, fetchMock);

    await expect(provider.send(pushRequest)).resolves.toMatchObject({ status: 'SENT' });
    await expect(provider.send(pushRequest)).resolves.toMatchObject({ status: 'SENT' });

    // One token request and two send requests: the minted token is reused.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps an FCM error status to the delivery record', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        error: { status: 'UNREGISTERED', message: 'Requested entity was not found.' }
      }, 404));
    const provider = new FcmPushProvider(serviceAccount, fetchMock);

    await expect(provider.send(pushRequest)).resolves.toEqual({
      status: 'FAILED',
      provider: 'FCM',
      errorCode: 'UNREGISTERED',
      errorMessage: 'Requested entity was not found.'
    });
  });

  it('reports an authentication failure without calling the messaging endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 401));
    const provider = new FcmPushProvider(serviceAccount, fetchMock);

    const result = await provider.send(pushRequest);

    expect(result).toMatchObject({ status: 'FAILED', provider: 'FCM', errorCode: 'PROVIDER_AUTH_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacts the service-account private key from a transport failure', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token-1', expires_in: 3600 }))
      .mockRejectedValueOnce(new Error(`request failed using ${registeredKeys.privateKey}`));
    const provider = new FcmPushProvider(serviceAccount, fetchMock);

    const result = await provider.send(pushRequest);

    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'PROVIDER_REQUEST_FAILED' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(result)).toContain('[redacted]');
  });
});