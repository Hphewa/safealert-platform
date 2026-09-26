import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalculateRiskAssessmentRequest, ReassessRiskAssessmentRequest } from '@safealert/contracts';
import { apiBaseUrl } from '../../../../services/api/client';
import {
  calculateRiskAssessment, createRiskAssessment, getRiskAssessment, getRiskAssessmentForIncident,
  getRiskAssessmentHistory, listVerifiedOfficerReports, reassessRiskAssessment
} from './riskAssessmentApi';

const factors: CalculateRiskAssessmentRequest = {
  incidentId: '123456789012345678901234', hazardSeverity: 'HIGH', peopleAffected: 80,
  vulnerablePeople: 12, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
  waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
};
afterEach(() => vi.unstubAllGlobals());
describe('risk assessment authenticated API adapter', () => {
  it('submits factors for calculation and only the decision fields for persistence', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ calculatedScore: 23, systemSuggestedRisk: 'HIGH' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await calculateRiskAssessment(factors, 'officer-token')).toEqual({ calculatedScore: 23, systemSuggestedRisk: 'HIGH' });
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiBaseUrl}/risk-assessments/calculate`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' }), body: JSON.stringify(factors)
    }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ assessment: { id: 'saved' } })));
    const input = { ...factors, finalRiskLevel: 'HIGH' as const };
    await createRiskAssessment(input, 'officer-token');
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiBaseUrl}/risk-assessments`, expect.objectContaining({ body: JSON.stringify(input) }));
  });
  it('encodes resource IDs and uses the current officer session for all reads', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await getRiskAssessment('assessment/one', 'officer-token');
    await getRiskAssessmentForIncident('report/one', 'officer-token');
    await getRiskAssessmentHistory('incident/history', 'officer-token');
    await listVerifiedOfficerReports('officer-token');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${apiBaseUrl}/risk-assessments/assessment%2Fone`, `${apiBaseUrl}/risk-assessments/incident/report%2Fone`,
      `${apiBaseUrl}/risk-assessments/incident/incident%2Fhistory/history`, `${apiBaseUrl}/reports/officer/verified`
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer officer-token' } });
    }
  });
  it('submits the shared reassessment request to the encoded source assessment route', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const input: ReassessRiskAssessmentRequest = {
      hazardSeverity: 'HIGH', peopleAffected: 80, vulnerablePeople: 12,
      roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN',
      finalRiskLevel: 'HIGH', reassessmentReason: 'Water levels are rising quickly.'
    };

    await reassessRiskAssessment('assessment/one', input, 'officer-token');

    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/risk-assessments/assessment%2Fone/reassess`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' }), body: JSON.stringify(input)
    }));
  });
  it('preserves duplicate conflict codes so the UI can offer the existing result', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'ACTIVE_ASSESSMENT_EXISTS', message: 'An active assessment already exists.' }
    }), { status: 409 })));
    await expect(createRiskAssessment({ ...factors, finalRiskLevel: 'HIGH' }, 'token')).rejects.toMatchObject({ status: 409, code: 'ACTIVE_ASSESSMENT_EXISTS' });
  });
  it('uses the central network-error response', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Offline')));
    await expect(getRiskAssessmentForIncident(factors.incidentId, 'token')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
