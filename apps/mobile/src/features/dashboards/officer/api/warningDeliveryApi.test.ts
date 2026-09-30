import { afterEach, expect, it, vi } from 'vitest';
import { apiBaseUrl } from '../../../../services/api/client';
import { getWarningDelivery } from './warningApi';

afterEach(() => vi.unstubAllGlobals());

it('requests the route warning ID and preserves the nested summary unchanged', async () => {
  const response = {
    summary: { recipientCount: 1, sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } },
    failedDeliveries: []
  };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const id = '6abcaaf9e79cadd4cf17d8c9';
  expect(await getWarningDelivery(id, 'officer-token')).toEqual(response);
  expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/warnings/${id}/delivery`, expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
  }));
});

it.each([401, 404, 500])('propagates HTTP %s rather than returning a zero summary', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'API_ERROR', message: 'Unavailable' } }), { status })));
  await expect(getWarningDelivery('6abcaaf9e79cadd4cf17d8c9', 'officer-token')).rejects.toMatchObject({ status });
});
