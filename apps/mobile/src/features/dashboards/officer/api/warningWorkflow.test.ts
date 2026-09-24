import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { canCreateWarning } from '@safealert/contracts';
import type {} from '../../../../../../api/src/types/express.js';
import { warningContext, warningInput, warningToken } from '../../../../../../api/src/modules/warnings/tests/warning.fixtures.js';
import { getRiskAssessment } from './riskAssessmentApi';
import { createWarning } from './warningApi';
import { parseWarningForm, validateWarningForm } from '../warningForm';

afterEach(() => vi.unstubAllGlobals());
async function setup(risk: 'HIGH' | 'CRITICAL' | 'LOW' | 'MODERATE') {
  const context = await warningContext(risk);
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const method = options?.method === 'POST' ? 'post' : 'get';
    const response = await request(context.app)[method](new URL(String(url)).pathname)
      .set(Object.fromEntries(new Headers(options?.headers).entries()))
      .send(options?.body ? JSON.parse(String(options.body)) : undefined);
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  }));
  return context;
}
it.each(['HIGH', 'CRITICAL'] as const)('%s: saved assessment → form → review/edit → save draft → reopen assessment', async (risk) => {
  const { assessment, warnings } = await setup(risk);
  const token = warningToken();
  const loaded = await getRiskAssessment(assessment.id, token);
  expect(canCreateWarning(loaded.assessment.finalRiskLevel)).toBe(true);
  const form = { ...warningInput, attachments: warningInput.attachments.join('\n') };
  expect(validateWarningForm(form)).toEqual({});
  const review = parseWarningForm(loaded.assessment.id, form);
  expect(review).toEqual({ assessmentId: assessment.id, ...warningInput });
  expect(warnings.warnings.size).toBe(0);
  const editedReview = parseWarningForm(loaded.assessment.id, { ...form, message: 'Updated safety instructions.' });
  const result = await createWarning(editedReview, token);
  expect(result.warning).toMatchObject({ ...editedReview, riskLevel: risk, status: 'DRAFT' });
  expect(warnings.warnings.size).toBe(1);
  const reopened = await getRiskAssessment(assessment.id, token);
  expect(reopened).toEqual(loaded);
  expect(canCreateWarning(reopened.assessment.finalRiskLevel)).toBe(true);
});
it.each(['LOW', 'MODERATE'] as const)('%s: no eligibility after load/reopen and direct save is rejected', async (risk) => {
  const { assessment, payload, warnings } = await setup(risk);
  for (let load = 0; load < 2; load += 1) {
    expect(canCreateWarning((await getRiskAssessment(assessment.id, warningToken())).assessment.finalRiskLevel)).toBe(false);
  }
  await expect(createWarning(payload, warningToken())).rejects.toMatchObject({ status: 409, code: 'WARNING_RISK_NOT_ELIGIBLE' });
  expect(warnings.warnings.size).toBe(0);
});
it('propagates network failures for retry without clearing form data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  const form = { ...warningInput, attachments: '' };
  const review = parseWarningForm('123456789012345678901234', form);
  await expect(createWarning(review, 'token')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(review.message).toBe(form.message);
});
