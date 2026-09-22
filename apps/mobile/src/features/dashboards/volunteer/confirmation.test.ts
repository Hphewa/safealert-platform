import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildConfirmationInput } from './confirmation';
import { listMyFieldConfirmations, submitFieldConfirmation } from './api/fieldConfirmationsApi';

afterEach(() => vi.unstubAllGlobals());
describe('volunteer confirmation submission', () => {
  it('retrieves personal history using only the authenticated session', async () => {
    const confirmations = [{ id: 'confirmation', status: 'PENDING', outcome: 'UNABLE_TO_CONFIRM' }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ confirmations }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await listMyFieldConfirmations('token')).toEqual({ confirmations });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/field-confirmations\/mine$/);
    expect(options.headers.Authorization).toBe('Bearer token');
  });
  it.each(['', '   '])('requires an explanation for Other (%j)', (details) => {
    expect(() => buildConfirmationInput('UNABLE_TO_CONFIRM', 'Other', details)).toThrow();
  });
  it('requires a flag reason', () => {
    expect(() => buildConfirmationInput('UNABLE_TO_CONFIRM', '', '')).toThrow('Select a reason');
  });
  it('trims Other explanation and omits flag data on confirm', () => {
    expect(buildConfirmationInput('UNABLE_TO_CONFIRM', 'Other', ' Low visibility ')).toEqual({ outcome: 'UNABLE_TO_CONFIRM', reason: 'Other', reasonDetails: 'Low visibility' });
    expect(buildConfirmationInput('CONFIRMED', 'Other', 'ignored')).toEqual({ outcome: 'CONFIRMED' });
  });
  it.each(['CONFIRMED', 'UNABLE_TO_CONFIRM'] as const)('sends %s to protected API and returns pending result', async (outcome) => {
    const confirmation = { id: 'confirmation', status: 'PENDING', outcome };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ confirmation }) });
    vi.stubGlobal('fetch', fetchMock);
    const input = buildConfirmationInput(outcome, 'Location does not match', '');
    expect(await submitFieldConfirmation('report-id', input, 'token')).toEqual({ confirmation });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain(`/field-confirmations/report-id/${outcome === 'CONFIRMED' ? 'confirm' : 'unable-to-confirm'}`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(options.body)).toEqual(outcome === 'CONFIRMED' ? {} : { reason: 'Location does not match' });
  });
  it('propagates API failures for the error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'REPORT_NOT_FOUND', message: 'Community report not found.' } }) }));
    await expect(submitFieldConfirmation('missing', { outcome: 'CONFIRMED' }, 'token')).rejects.toThrow('Community report not found.');
  });
});
