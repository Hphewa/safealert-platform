import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateResponseRequestRequest } from '@safealert/contracts';

const storage = vi.hoisted(() => new Map<string, string>());
const network = vi.hoisted(() => ({ connected: false }));
const createRequest = vi.hoisted(() => vi.fn());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn(async (key: string) => { storage.delete(key); })
} }));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: vi.fn(async () => ({
  isConnected: network.connected, isInternetReachable: network.connected
})), addEventListener: vi.fn(() => () => undefined) } }));
vi.mock('./api/responseRequestApi', () => ({ createResidentResponseRequest: createRequest }));

import {
  listQueuedEmergencyRequests, saveEmergencyRequestWithOfflineSupport, syncQueuedEmergencyRequests
} from './offlineEmergencyRequestQueue';

const payload: CreateResponseRequestRequest = {
  assistanceType: 'FLOOD_ASSISTANCE', location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2, medicalNeeds: false, injuredPeople: 0,
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'LIMITED', contact: { name: 'Resident User', phoneNumber: '0775551234' },
  description: 'Flood water entered the home.'
};

beforeEach(() => { storage.clear(); network.connected = false; createRequest.mockReset(); });

describe('resident emergency request offline queue', () => {
  it('queues a help request locally while offline', async () => {
    const result = await saveEmergencyRequestWithOfflineSupport({ userId: 'resident-1', accessToken: 'token', payload });
    expect(result).toEqual({ saved: 'local' });
    expect(createRequest).not.toHaveBeenCalled();
    expect(await listQueuedEmergencyRequests('resident-1')).toHaveLength(1);
  });

  it('submits queued help requests with the stable idempotency key after reconnecting', async () => {
    await saveEmergencyRequestWithOfflineSupport({ userId: 'resident-1', accessToken: 'token', payload });
    network.connected = true;
    createRequest.mockResolvedValue({ responseRequest: { id: 'request-1' } });

    await expect(syncQueuedEmergencyRequests('resident-1', 'token')).resolves.toEqual({ synced: 1, remaining: 0 });
    expect(createRequest).toHaveBeenCalledWith(payload, 'token', expect.stringMatching(/^resident-emergency-/));
  });
});
