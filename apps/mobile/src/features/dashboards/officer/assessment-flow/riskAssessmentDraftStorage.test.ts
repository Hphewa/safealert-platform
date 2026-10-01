import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiskAssessmentDraft } from './riskAssessmentDraftState';

const state = vi.hoisted(() => ({ values: new Map<string, string>(), setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  setItem: (key: string, value: string) => state.setItem(key, value),
  getItem: (key: string) => state.getItem(key),
  removeItem: (key: string) => state.removeItem(key)
} }));
import { clearDraft, clearDraftForUserChange, readDraft, writeDraft } from './riskAssessmentDraftStorage';

const draft: RiskAssessmentDraft = {
  mode: 'INITIAL', incidentId: 'incident-1', assessmentId: null,
  factors: { hazardSeverity: 'HIGH', peopleAffected: '12', vulnerablePeople: '3', roadAccessibility: 'UNKNOWN',
    infrastructureImpact: 'LOW', waterLevelTrend: 'UNKNOWN', weatherCondition: 'HEAVY_RAIN' },
  calculationPreview: { factors: { hazardSeverity: 'HIGH', peopleAffected: 12, vulnerablePeople: 3,
    roadAccessibility: 'UNKNOWN', infrastructureImpact: 'LOW', waterLevelTrend: 'UNKNOWN', weatherCondition: 'HEAVY_RAIN' },
    result: { calculatedScore: 18, systemSuggestedRisk: 'HIGH', factorContributions: [], calculationVersion: 'risk-v1' } },
  finalRiskLevel: 'HIGH', decisionReason: 'Local access is threatened.', reassessmentReason: ''
};

beforeEach(() => {
  state.values.clear(); state.setItem.mockReset(); state.getItem.mockReset(); state.removeItem.mockReset();
  state.setItem.mockImplementation(async (key: string, value: string) => { state.values.set(key, value); });
  state.getItem.mockImplementation(async (key: string) => state.values.get(key) ?? null);
  state.removeItem.mockImplementation(async (key: string) => { state.values.delete(key); });
});
afterEach(() => { state.values.clear(); });

describe('risk assessment draft storage', () => {
  it('uses a versioned user key and restores editable fields without calculation preview', async () => {
    await writeDraft('officer-1', draft, new Date('2026-10-01T12:00:00.000Z'));
    const key = 'safealert:assessment-draft:v1:officer-1';
    expect(state.values.has(key)).toBe(true);
    const stored = JSON.parse(state.values.get(key)!);
    expect(stored).toMatchObject({ version: 1, mode: 'INITIAL', incidentId: 'incident-1', updatedAt: '2026-10-01T12:00:00.000Z' });
    expect(stored).not.toHaveProperty('calculationPreview');
    await expect(readDraft('officer-1')).resolves.toMatchObject({ incidentId: 'incident-1', calculationPreview: null,
      decisionReason: 'Local access is threatened.' });
  });

  it('isolates officers, rejects unsupported or corrupt payloads, and clears only the selected key', async () => {
    await writeDraft('officer-a', draft);
    await writeDraft('officer-b', { ...draft, incidentId: 'incident-b' });
    expect((await readDraft('officer-a'))?.incidentId).toBe('incident-1');
    expect((await readDraft('officer-b'))?.incidentId).toBe('incident-b');
    state.values.set('safealert:assessment-draft:v1:legacy', '{bad json');
    await expect(readDraft('legacy')).resolves.toBeNull();
    state.values.set('safealert:assessment-draft:v1:unsupported', JSON.stringify({ version: 9 }));
    await expect(readDraft('unsupported')).resolves.toBeNull();
    await clearDraft('officer-a');
    expect(await readDraft('officer-a')).toBeNull();
    expect(await readDraft('officer-b')).not.toBeNull();
  });

  it('clears the previous user draft on logout or account change, but preserves it for the same user', async () => {
    await writeDraft('officer-a', draft);
    await writeDraft('officer-b', { ...draft, incidentId: 'incident-b' });

    await clearDraftForUserChange('officer-a', null);
    expect(await readDraft('officer-a')).toBeNull();
    expect(await readDraft('officer-b')).not.toBeNull();

    await clearDraftForUserChange('officer-b', 'officer-b');
    expect(await readDraft('officer-b')).not.toBeNull();
    await clearDraftForUserChange('officer-b', 'officer-c');
    expect(await readDraft('officer-b')).toBeNull();
  });

  it('serializes concurrent writes so a slow older draft cannot replace a later edit', async () => {
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    state.setItem.mockImplementationOnce(async (key: string, value: string) => {
      markFirstStarted?.();
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      state.values.set(key, value);
    });
    const first = writeDraft('officer-1', draft);
    await firstStarted;
    const second = writeDraft('officer-1', { ...draft, incidentId: 'incident-later' });
    releaseFirst?.();
    await Promise.all([first, second]);
    expect((await readDraft('officer-1'))?.incidentId).toBe('incident-later');
  });

  it('treats storage failures as recoverable and does not throw into the assessment flow', async () => {
    state.getItem.mockRejectedValueOnce(new Error('offline storage'));
    state.setItem.mockRejectedValueOnce(new Error('offline storage'));
    state.removeItem.mockRejectedValueOnce(new Error('offline storage'));
    await expect(readDraft('officer-1')).resolves.toBeNull();
    await expect(writeDraft('officer-1', draft)).resolves.toBeUndefined();
    await expect(clearDraft('officer-1')).resolves.toBeUndefined();
  });
});
