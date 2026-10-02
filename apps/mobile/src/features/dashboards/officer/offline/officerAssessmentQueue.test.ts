import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateRiskAssessmentRequest, SafeRiskAssessment } from '@safealert/contracts';

const storage = vi.hoisted(() => new Map<string, string>());
const network = vi.hoisted(() => ({ connected: false }));
const api = vi.hoisted(() => ({
  create: vi.fn(), getForIncident: vi.fn(), get: vi.fn(), history: vi.fn(), reassess: vi.fn()
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { storage.delete(key); })
} }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: vi.fn(async () => ({
  isConnected: network.connected, isInternetReachable: network.connected
})) } }));
vi.mock('../api/riskAssessmentApi', () => ({
  createRiskAssessment: api.create, getRiskAssessmentForIncident: api.getForIncident,
  getRiskAssessment: api.get, getRiskAssessmentHistory: api.history, reassessRiskAssessment: api.reassess
}));

import {
  enqueueOfficerAssessment, listOfficerAssessmentQueue, saveOfficerAssessmentWithOfflineSupport,
  syncOfficerAssessmentQueue
} from './officerAssessmentQueue';

const request: CreateRiskAssessmentRequest = {
  incidentId: 'incident-1', hazardSeverity: 'HIGH', peopleAffected: 12, vulnerablePeople: 3,
  roadAccessibility: 'UNKNOWN', infrastructureImpact: 'LOW', waterLevelTrend: 'RISING',
  weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH'
};
const saved = { ...request, id: 'assessment-1', assessedById: 'officer-1', status: 'ACTIVE',
  calculatedScore: 18, systemSuggestedRisk: 'HIGH', assessedAt: '2026-10-02T10:00:00.000Z',
  isDeleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z' } as SafeRiskAssessment;

beforeEach(() => {
  storage.clear(); network.connected = false;
  api.create.mockReset(); api.getForIncident.mockReset(); api.get.mockReset(); api.history.mockReset(); api.reassess.mockReset();
});

describe('officer risk assessment offline queue', () => {
  it('queues a valid final decision without calling the API while offline', async () => {
    const result = await saveOfficerAssessmentWithOfflineSupport({ userId: 'officer-1', accessToken: 'token',
      payload: { mode: 'INITIAL', request }, saveOnline: api.create });
    expect(result).toEqual({ saved: 'local' });
    expect(api.create).not.toHaveBeenCalled();
    expect(await listOfficerAssessmentQueue('officer-1')).toHaveLength(1);
  });

  it('acknowledges a matching server assessment after an uncertain retry', async () => {
    await enqueueOfficerAssessment('officer-1', { mode: 'INITIAL', request });
    network.connected = true;
    api.getForIncident.mockResolvedValue({ assessment: saved });

    await expect(syncOfficerAssessmentQueue('officer-1', 'token')).resolves.toEqual({ synced: 1, remaining: 0 });
    expect(api.create).not.toHaveBeenCalled();
    expect(await listOfficerAssessmentQueue('officer-1')).toEqual([]);
  });

  it('stops and retains the queue item when the server has a different assessment', async () => {
    await enqueueOfficerAssessment('officer-1', { mode: 'INITIAL', request });
    network.connected = true;
    api.getForIncident.mockResolvedValue({ assessment: { ...saved, finalRiskLevel: 'CRITICAL' } });

    await expect(syncOfficerAssessmentQueue('officer-1', 'token')).resolves.toMatchObject({ synced: 0, remaining: 1 });
    expect((await listOfficerAssessmentQueue('officer-1'))[0].status).toBe('FAILED');
  });
});
