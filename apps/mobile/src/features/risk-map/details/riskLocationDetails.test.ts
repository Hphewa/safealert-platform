import { describe, expect, it, vi } from 'vitest';
import { parseRiskLocationDetailsResponse } from './riskLocationDetailsApi';
import { createRiskLocationDetailsResource } from './riskLocationDetailsResource';
import type { RiskLocationDetailsResponse } from '@safealert/contracts';

const factorSet = { hazardSeverity: 'HIGH', peopleAffected: 27, vulnerablePeople: 6,
  roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' };
const common = { incidentId: '111111111111111111111111', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] },
  riskLevel: 'CRITICAL', assessedAt: '2026-10-01T12:00:00Z', hasPublishedWarning: true,
  evidence: [{ type: 'IMAGE',
    imageUrl: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.jpg', createdAt: '2026-10-01T11:00:00Z' }] };
const response = (role: string, detail: unknown): unknown => ({ role, generatedAt: '2026-10-02T12:00:00Z', detail });
const residentResponse = response('RESIDENT', { ...common, riskFactors: { roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' } });
const deferred = () => { let resolve!: (value: RiskLocationDetailsResponse) => void; const promise = new Promise<RiskLocationDetailsResponse>(yes => { resolve = yes; }); return { promise, resolve }; };

describe('risk location detail API projection', () => {
  it('accepts safe resident detail and strips unexpected fields', () => {
    const result = parseRiskLocationDetailsResponse(response('RESIDENT', { ...common, riskFactors: { roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' }, decisionReason: 'secret', reportCount: 4 }), 'RESIDENT');
    expect(result.role).toBe('RESIDENT'); expect(result.detail).not.toHaveProperty('decisionReason'); expect(result.detail).not.toHaveProperty('reportCount');
  });
  it.each(['DISASTER_OFFICER', 'EMERGENCY_RESPONDER', 'COMMUNITY_VOLUNTEER', 'RESIDENT'])('validates role-specific risk factors for %s', role => {
    const factors = role === 'RESIDENT' ? { roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' }
      : role === 'COMMUNITY_VOLUNTEER' ? { hazardSeverity: 'HIGH', peopleAffected: 27, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' }
        : factorSet;
    const detail = { ...common, riskFactors: factors, ...(role === 'RESIDENT' || role === 'COMMUNITY_VOLUNTEER' ? {} : { incidentStatus: 'ACTIVE', reportCount: 4 }),
      ...(role === 'DISASTER_OFFICER' ? { assessmentId: '222222222222222222222222', calculatedScore: 30 } : {}) };
    expect(parseRiskLocationDetailsResponse(response(role, detail), role as RiskLocationDetailsResponse['role']).role).toBe(role);
  });
  it.each([
    [response('RESIDENT', { ...common, riskFactors: { roadAccessibility: 'IMPOSSIBLE', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' } }), 'RESIDENT'],
    [response('RESIDENT', { ...common, evidence: [{ ...common.evidence[0], imageUrl: 'file:///private/image.jpg' }], riskFactors: { roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'HIGH', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' } }), 'RESIDENT'],
    [response('EMERGENCY_RESPONDER', { ...common, riskFactors: factorSet }), 'EMERGENCY_RESPONDER'],
    [residentResponse, 'COMMUNITY_VOLUNTEER']
  ] as const)('rejects malformed, private or mismatched detail payloads', (body, role) => {
    expect(() => parseRiskLocationDetailsResponse(body, role)).toThrow();
  });
});

describe('risk location detail request lifecycle', () => {
  it('ignores late requests and clears details on blur', async () => {
    const pending = deferred();
    const resource = createRiskLocationDetailsResource(vi.fn().mockReturnValue(pending.promise));
    resource.start(); resource.suspend();
    pending.resolve(parseRiskLocationDetailsResponse(residentResponse, 'RESIDENT'));
    await Promise.resolve(); await Promise.resolve();
    expect(resource.getSnapshot().data).toBeNull();
  });
  it('clears old data on refresh and returns fresh details after retry', async () => {
    const valid = parseRiskLocationDetailsResponse(residentResponse, 'RESIDENT');
    const resource = createRiskLocationDetailsResource(vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(valid));
    await resource.start(); expect(resource.getSnapshot().error).toBeTruthy();
    const retry = resource.refresh(); expect(resource.getSnapshot().data).toBeNull(); await retry;
    expect(resource.getSnapshot()).toMatchObject({ data: valid, error: null, loading: false });
  });
});
