import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildConfirmationInput,
  buildConfirmedInput,
  buildUnableToConfirmInput,
  emptyVerificationChecklistDraft,
  toExplicitVerificationChecklist
} from './confirmation';
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
  it('requires explicit yes or no answers for every confirmed checklist item', () => {
    expect(() => buildConfirmedInput(emptyVerificationChecklistDraft, '')).toThrow('Complete all required field checks.');
    expect(toExplicitVerificationChecklist({
      locationMatches: true,
      photoMatches: false,
      situationStillExists: true,
      severityAppearsCorrect: false
    })).toEqual({
      locationMatches: true,
      photoMatches: false,
      situationStillExists: true,
      severityAppearsCorrect: false
    });
  });
  it('trims Other explanation and omits flag data on confirm', () => {
    expect(buildUnableToConfirmInput('Other', ' Low visibility ')).toEqual({ outcome: 'UNABLE_TO_CONFIRM', reason: 'Other', reasonDetails: 'Low visibility' });
    expect(buildConfirmedInput({
      locationMatches: true,
      photoMatches: false,
      situationStillExists: true,
      severityAppearsCorrect: true
    }, '  Road is still flooded.  ', '/api/v1/media/report-evidence/photo.jpg')).toEqual({
      outcome: 'CONFIRMED',
      verificationChecklist: {
        locationMatches: true,
        photoMatches: false,
        situationStillExists: true,
        severityAppearsCorrect: true
      },
      observation: 'Road is still flooded.',
      mediaReference: '/api/v1/media/report-evidence/photo.jpg'
    });
  });
  it.each(['CONFIRMED', 'UNABLE_TO_CONFIRM'] as const)('sends %s to protected API and returns pending result', async (outcome) => {
    const confirmation = { id: 'confirmation', status: 'PENDING', outcome };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ confirmation }) });
    vi.stubGlobal('fetch', fetchMock);
    const input = outcome === 'CONFIRMED'
      ? buildConfirmedInput({
          locationMatches: true,
          photoMatches: false,
          situationStillExists: true,
          severityAppearsCorrect: true
        }, 'Still active')
      : buildConfirmationInput(outcome, 'Location does not match', '');
    expect(await submitFieldConfirmation('report-id', input, 'token')).toEqual({ confirmation });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain(`/field-confirmations/report-id/${outcome === 'CONFIRMED' ? 'confirm' : 'unable-to-confirm'}`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(options.body)).toEqual(outcome === 'CONFIRMED' ? {
      verificationChecklist: {
        locationMatches: true,
        photoMatches: false,
        situationStillExists: true,
        severityAppearsCorrect: true
      },
      observation: 'Still active'
    } : { reason: 'Location does not match' });
  });
  it('propagates API failures for the error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'REPORT_NOT_FOUND', message: 'Community report not found.' } }) }));
    await expect(submitFieldConfirmation('missing', buildConfirmedInput({
      locationMatches: true,
      photoMatches: true,
      situationStillExists: true,
      severityAppearsCorrect: true
    }, ''), 'token')).rejects.toThrow('Community report not found.');
  });
});
