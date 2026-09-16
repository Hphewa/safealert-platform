import { afterEach, expect, it, vi } from 'vitest';
import { apiBaseUrl } from '../../../../services/api/client';
import { loadReportEvidence } from './reportEvidence';

afterEach(() => vi.unstubAllGlobals());

it('loads protected evidence using the session and returns image data usable on native and web', async () => {
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    if (url !== `${apiBaseUrl}/reports/report-1/evidence` ||
        new Headers(options.headers).get('Authorization') !== 'Bearer officer-token') {
      return new Response('{}', { status: 401 });
    }
    return new Response(JSON.stringify({ dataUri: 'data:image/png;base64,cGhvdG8=' }));
  });
  expect(await loadReportEvidence('/reports/report-1/evidence', 'officer-token'))
    .toBe('data:image/png;base64,cGhvdG8=');
});

it('preserves external image URLs without sending the session token to their servers', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('Must not fetch external URLs with auth'); });
  expect(await loadReportEvidence('https://example.com/evidence.jpg', 'officer-token'))
    .toBe('https://example.com/evidence.jpg');
});

it('surfaces a missing image as an error so the screen can offer retry', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    error: { code: 'EVIDENCE_NOT_FOUND', message: 'Photo unavailable.' }
  }), { status: 404 }));
  await expect(loadReportEvidence('/reports/report-1/evidence', 'officer-token'))
    .rejects.toMatchObject({ code: 'EVIDENCE_NOT_FOUND' });
});
