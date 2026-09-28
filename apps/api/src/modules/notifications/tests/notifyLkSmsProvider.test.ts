import { describe, expect, it, vi } from 'vitest';
import { NOTIFY_LK_SEND_ENDPOINT, NotifyLkSmsProvider } from '../providers/notifyLkSmsProvider.js';

const config = { userId: 'user-987654', apiKey: 'api-key-abc123', senderId: 'NotifyDEMO' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function textResponse(body: string, status: number) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

describe('Notify.lk SMS provider', () => {
  it('reports missing credentials as not configured and never calls the API', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new NotifyLkSmsProvider({ userId: undefined, apiKey: undefined, senderId: 'NotifyDEMO' }, fetchMock);

    expect(provider.isConfigured()).toBe(false);
    const result = await provider.send({ to: '94771234567', message: 'SafeAlert' });

    expect(result).toEqual({
      status: 'FAILED',
      provider: 'NOTIFY_LK',
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      errorMessage: 'Notify.lk credentials are not configured on the server.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the documented parameters and maps the documented success body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: 'success', data: 'Sent' }));
    const provider = new NotifyLkSmsProvider(config, fetchMock);

    const result = await provider.send({ to: '94771234567', message: 'SAFEALERT - HIGH WARNING' });

    expect(result).toEqual({ status: 'SENT', provider: 'NOTIFY_LK', providerStatus: 'Sent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(NOTIFY_LK_SEND_ENDPOINT);
    // The API key must never be placed in the request URL.
    expect(String(url)).not.toContain(config.apiKey);
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(String(options?.body));
    expect(body.get('user_id')).toBe('user-987654');
    expect(body.get('api_key')).toBe('api-key-abc123');
    expect(body.get('sender_id')).toBe('NotifyDEMO');
    expect(body.get('to')).toBe('94771234567');
    expect(body.get('message')).toBe('SAFEALERT - HIGH WARNING');
  });

  it('stores the provider message id and status when Notify.lk returns them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      status: 'success',
      data: { uid: 12345, status: 'sent' }
    }));
    const provider = new NotifyLkSmsProvider(config, fetchMock);

    await expect(provider.send({ to: '94771234567', message: 'Hello' })).resolves.toEqual({
      status: 'SENT',
      provider: 'NOTIFY_LK',
      providerStatus: 'sent',
      providerMessageId: '12345'
    });
  });

  it('treats an HTTP 200 error body as a failure instead of a successful send', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      status: 'error',
      code: '100',
      message: 'Invalid API KEY'
    }));
    const provider = new NotifyLkSmsProvider(config, fetchMock);

    await expect(provider.send({ to: '94771234567', message: 'Hello' })).resolves.toEqual({
      status: 'FAILED',
      provider: 'NOTIFY_LK',
      errorCode: '100',
      errorMessage: 'Invalid API KEY'
    });
  });

  it('maps an unsuccessful Notify.lk response to FAILED without assuming HTTP 200 means success', async () => {
    const cases: Response[] = [
      jsonResponse({ status: 'error', code: '501', message: 'Server error' }, 500),
      jsonResponse({ status: 'error', code: '401', message: 'Unauthorized' }, 401),
      jsonResponse({ status: 'queued' }),
      textResponse('<html>Gateway timeout</html>', 200),
      textResponse('Bad gateway', 502)
    ];

    for (const response of cases) {
      const provider = new NotifyLkSmsProvider(config, vi.fn<typeof fetch>().mockResolvedValue(response));
      const result = await provider.send({ to: '94771234567', message: 'Hello' });

      expect(result.status).toBe('FAILED');
      expect(result).toMatchObject({ provider: 'NOTIFY_LK' });
    }
  });

  it('reports a transport failure without leaking credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error(`connect failed for ${config.apiKey}`));
    const provider = new NotifyLkSmsProvider(config, fetchMock);

    const result = await provider.send({ to: '94771234567', message: 'Hello' });

    expect(result.status).toBe('FAILED');
    expect(result).toMatchObject({ provider: 'NOTIFY_LK', errorCode: 'PROVIDER_REQUEST_FAILED' });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(JSON.stringify(result)).toContain('[redacted]');
  });

  it('redacts the API key from an error message echoed by the provider', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      status: 'error',
      code: '100',
      message: `Invalid API key api-key-abc123 for user user-987654`
    }));
    const provider = new NotifyLkSmsProvider(config, fetchMock);

    const result = await provider.send({ to: '94771234567', message: 'Hello' });

    expect(result).toMatchObject({ status: 'FAILED', errorCode: '100' });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(JSON.stringify(result)).not.toContain(config.userId);
  });
});