import { describe, expect, it, vi } from 'vitest';
import { parseRiskMapResponse } from './api/riskMapApi';
import { filterRiskMapIncidents, riskMapPresentation } from './riskMapPresentation';
import { createRiskMapResource } from './riskMapResource';
import { createMultiMarkerHtml } from '../dashboards/shared/maps/multiMarkerHtml';
import { parseMultiMarkerMessage } from '../dashboards/shared/maps/multiMarkerMessages';
import type { RiskMapResponse } from '@safealert/contracts';

const item = { incidentId: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, riskLevel: 'MODERATE', assessedAt: '2026-10-01T12:00:00Z', hasPublishedWarning: false };
const response = (incidents: unknown[] = [item]) => ({ role: 'RESIDENT', generatedAt: '2026-10-02T12:00:00Z', incidents });
const data = () => parseRiskMapResponse(response(), 'RESIDENT');
const deferred = () => { let resolve!: (value: RiskMapResponse) => void; let reject!: (error: Error) => void; const promise = new Promise<RiskMapResponse>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('Risk Map payload and presentation', () => {
  it('projects public data and preserves longitude/latitude order and Medium', () => {
    const result = parseRiskMapResponse(response([{ ...item, assessmentId: 'private', notes: 'secret' }]), 'RESIDENT');
    expect(result.incidents[0]).toEqual(item);
    expect(riskMapPresentation.MODERATE).toEqual({ label: 'Medium', color: '#eab308' });
  });
  it.each([null, {}, response([{ ...item, location: null }]), response([{ ...item, location: { type: 'Point', coordinates: [181, 0] } }]), response([{ ...item, riskLevel: 'UNKNOWN' }]), response([{ ...item, assessedAt: 'bad' }]), response([item, item])])('rejects invalid or duplicate payloads: %j', (value) => {
    expect(() => parseRiskMapResponse(value, 'RESIDENT')).toThrow();
  });
  it('rejects a response for another role', () => expect(() => parseRiskMapResponse(response(), 'DISASTER_OFFICER')).toThrow());
  it('requires operational fields for responders and officers', () => {
    expect(() => parseRiskMapResponse({ ...response(), role: 'EMERGENCY_RESPONDER' }, 'EMERGENCY_RESPONDER')).toThrow();
    const operational = { ...item, incidentStatus: 'ACTIVE', reportCount: 4 };
    expect(parseRiskMapResponse({ ...response([operational]), role: 'EMERGENCY_RESPONDER' }, 'EMERGENCY_RESPONDER').incidents[0]).toEqual(operational);
    expect(() => parseRiskMapResponse({ ...response([operational]), role: 'DISASTER_OFFICER' }, 'DISASTER_OFFICER')).toThrow();
  });
  it('filters all severities without changing the contract enum', () => {
    expect(filterRiskMapIncidents(data().incidents, 'ALL')).toHaveLength(1);
    expect(filterRiskMapIncidents(data().incidents, 'MODERATE')).toHaveLength(1);
    expect(filterRiskMapIncidents(data().incidents, 'HIGH')).toEqual([]);
  });
});

describe('Risk Map freshness resource', () => {
  it('ignores old requests and clears stale actions while refreshing', async () => {
    const first = deferred(); const second = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const resource = createRiskMapResource(load); resource.start();
    const refresh = resource.refresh();
    first.resolve(data()); await Promise.resolve();
    expect(resource.getSnapshot().data).toBeNull();
    second.resolve(data()); await refresh;
    resource.select('incident-1'); expect(resource.getSnapshot().selectedId).toBe('incident-1');
    resource.suspend(); expect(resource.getSnapshot().data).toBeNull();
    expect(resource.getSnapshot().selectedId).toBeNull();
  });
  it('updates a selection on reassessment and removes it after close', async () => {
    const load = vi.fn().mockResolvedValueOnce(data()).mockResolvedValueOnce(parseRiskMapResponse(response([{ ...item, riskLevel: 'CRITICAL' }]), 'RESIDENT')).mockResolvedValueOnce(parseRiskMapResponse(response([]), 'RESIDENT'));
    const resource = createRiskMapResource(load); await resource.start(); resource.select('incident-1');
    await resource.refresh(); expect(resource.getSnapshot().selectedId).toBe('incident-1');
    expect(resource.getSnapshot().data?.incidents[0].riskLevel).toBe('CRITICAL');
    await resource.refresh(); expect(resource.getSnapshot().selectedId).toBeNull();
  });
  it('clears data on failure and ignores requests after blur or session disposal', async () => {
    const pending = deferred(); const resource = createRiskMapResource(vi.fn().mockResolvedValueOnce(data()).mockReturnValueOnce(pending.promise));
    await resource.start(); resource.select('incident-1'); const task = resource.refresh(); resource.suspend();
    pending.resolve(data()); await task; expect(resource.getSnapshot().data).toBeNull();
    const failing = createRiskMapResource(async () => { throw new Error('Unauthorized'); }); await failing.start();
    expect(failing.getSnapshot()).toMatchObject({ data: null, selectedId: null, loading: false, error: 'Unable to load risk locations. Sign in again if your session has expired, or retry.' });
  });
});

describe('shared multi-marker bridge', () => {
  it('safely serializes labels and only the marker allowlist', () => {
    const html = createMultiMarkerHtml([{ id: 'one', latitude: 6.92, longitude: 79.86, label: '</script><script>alert(1)</script>\u2028&', color: '#eab308', ...{ accessToken: 'secret-token' } }]);
    expect(html).not.toContain('secret-token'); expect(html).not.toContain('</script><script>alert');
    expect(html).toContain('\\u003c/script'); expect(html).toContain('#eab308');
    expect(html).toContain('MARKER_SELECTED'); expect(html).toContain('tileerror');
  });
  it('uses blue for existing callers, rejects invalid locations and unsafe colors', () => {
    const html = createMultiMarkerHtml([{ id: 'old', latitude: 0, longitude: 0 }, { id: 'bad', latitude: NaN, longitude: 0 }, { id: 'css', latitude: 1, longitude: 1, color: 'url(secret)' }]);
    expect(html).toContain('#2563eb'); expect(html).not.toContain('url(secret)'); expect(html).not.toContain('"id":"bad"');
  });
  it.each(['bad-json', '{}', '{"type":"MARKER_SELECTED","id":1}', '{"type":"MARKER_SELECTED","id":"x","href":"/officer"}', '{"type":"NAVIGATE","id":"x"}'])('ignores malformed messages %s', value => expect(parseMultiMarkerMessage(value)).toBeNull());
  it('accepts only defined bridge messages', () => {
    expect(parseMultiMarkerMessage('{"type":"MARKER_SELECTED","id":"x"}')).toEqual({ type: 'MARKER_SELECTED', id: 'x' });
    expect(parseMultiMarkerMessage('{"type":"MAP_READY"}')).toEqual({ type: 'MAP_READY' });
  });
});
