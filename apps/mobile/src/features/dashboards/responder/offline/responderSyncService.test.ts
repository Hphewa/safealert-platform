import { describe, expect, it, vi } from 'vitest';
import type { SafeResponseRequest } from '@safealert/contracts';
import { ApiClientError } from '../../../../services/api/client';
import { createConnectivityStore } from './connectivity';
import { createResponderUpdateQueue } from './responderUpdateQueue';
import {
  createResponderSyncService,
  validateQueueItemForProcessing,
  type ResponderSyncApi,
  type ResponderSyncCache
} from './responderSyncService';

const mockRequestId = '507f1f77bcf86cd799439011';
const mockResponderId = 'responder-1';
const mockToken = 'valid-responder-token';

const baseRequest: SafeResponseRequest = {
  id: mockRequestId,
  residentId: 'resident-1',
  assignedResponderId: mockResponderId,
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 0,
  medicalNeeds: false,
  roadAccessibility: 'ACCESSIBLE',
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  contact: { name: 'Resident', phoneNumber: '+94771234567' },
  description: 'Resident needs medical triage.',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z'
};

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    })
  };
}

function createMockConnectivity(initialState: { isConnected: boolean; isInternetReachable: boolean }) {
  let currentListener: ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | null = null;
  const store = createConnectivityStore({
    listen: (listener) => {
      currentListener = listener;
      listener(initialState);
      return () => {
        currentListener = null;
      };
    }
  });

  return {
    store,
    emit(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
      currentListener?.(state);
    }
  };
}

function createMockSyncEnv(initialConnected = true) {
  const storage = createMockStorage();
  const queue = createResponderUpdateQueue(storage);
  const conn = createMockConnectivity({
    isConnected: initialConnected,
    isInternetReachable: initialConnected
  });

  // Keep test connectivity listener active so getSnapshot() reflects state
  conn.store.subscribe(() => {});

  const calls: { method: string; args: unknown[] }[] = [];
  const cachedRequests = new Map<string, SafeResponseRequest>();

  const api: ResponderSyncApi = {
    updateResponderRequestProgress: vi.fn(async (requestId, status, accessToken, completionDetails) => {
      calls.push({ method: 'updateProgress', args: [requestId, status, accessToken, completionDetails] });
      return {
        ...baseRequest,
        id: requestId,
        status,
        ...(completionDetails ?? {}),
        updatedAt: new Date().toISOString()
      };
    }),
    saveResponderFieldUpdate: vi.fn(async (requestId, fieldNotes, accessToken) => {
      calls.push({ method: 'fieldUpdate', args: [requestId, fieldNotes, accessToken] });
      return {
        ...baseRequest,
        id: requestId,
        fieldNotes,
        fieldUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }),
    getResponderRequestById: vi.fn(async (requestId) => {
      return cachedRequests.get(requestId) ?? baseRequest;
    })
  };

  const cache: ResponderSyncCache = {
    updateCachedResponderRequest: vi.fn((request: SafeResponseRequest) => {
      cachedRequests.set(request.id, request);
    })
  };

  const syncService = createResponderSyncService(queue, conn.store, api, cache);

  return { storage, queue, conn, api, cache, syncService, calls, cachedRequests };
}

describe('LDFEW-332 to LDFEW-336 Responder Offline Synchronization', () => {
  describe('Queue Item Validation before Processing', () => {
    it('validates a correct progress update item', () => {
      const validItem = {
        localId: 'loc-1',
        responderId: mockResponderId,
        requestId: mockRequestId,
        expectedStatus: 'ASSIGNED',
        update: { type: 'progress', payload: { status: 'DISPATCHED' } },
        createdAt: new Date().toISOString(),
        sequence: 1,
        syncState: 'pending'
      };

      const result = validateQueueItemForProcessing(validItem, mockResponderId);
      expect(result.isValid).toBe(true);
    });

    it('validates a correct completed progress item with required completion details', () => {
      const validCompleted = {
        localId: 'loc-2',
        responderId: mockResponderId,
        requestId: mockRequestId,
        expectedStatus: 'IN_PROGRESS',
        update: {
          type: 'progress',
          payload: {
            status: 'COMPLETED',
            completionDetails: {
              assistanceProvided: 'Transported to shelter',
              completionSummary: 'Operation completed successfully.'
            }
          }
        },
        createdAt: new Date().toISOString(),
        sequence: 2,
        syncState: 'pending'
      };

      const result = validateQueueItemForProcessing(validCompleted, mockResponderId);
      expect(result.isValid).toBe(true);
    });

    it('rejects an item belonging to another responder or corrupted ID', () => {
      const wrongOwner = {
        localId: 'loc-1',
        responderId: 'other-responder',
        requestId: mockRequestId,
        expectedStatus: 'ASSIGNED',
        update: { type: 'progress', payload: { status: 'DISPATCHED' } },
        createdAt: new Date().toISOString(),
        sequence: 1,
        syncState: 'pending'
      };

      expect(validateQueueItemForProcessing(wrongOwner, mockResponderId).isValid).toBe(false);
      expect(validateQueueItemForProcessing({ ...wrongOwner, requestId: 'invalid-id' }, 'other-responder').isValid).toBe(false);
    });

    it('rejects completed progress missing required completion details', () => {
      const missingDetails = {
        localId: 'loc-1',
        responderId: mockResponderId,
        requestId: mockRequestId,
        expectedStatus: 'IN_PROGRESS',
        update: { type: 'progress', payload: { status: 'COMPLETED' } },
        createdAt: new Date().toISOString(),
        sequence: 1,
        syncState: 'pending'
      };

      expect(validateQueueItemForProcessing(missingDetails, mockResponderId).isValid).toBe(false);
    });
  });

  describe('Scenario 1: Reconnect with empty queue', () => {
    it('does not trigger API calls when queue is empty and network reconnects', async () => {
      const { syncService, conn, api } = createMockSyncEnv(false);

      // Register session while offline
      syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

      // Network transitions to online
      conn.emit({ isConnected: true, isInternetReachable: true });

      await vi.waitFor(() => {
        expect(syncService.getSnapshot(mockResponderId).isSyncing).toBe(false);
      });

      expect(api.updateResponderRequestProgress).not.toHaveBeenCalled();
      expect(api.saveResponderFieldUpdate).not.toHaveBeenCalled();
      expect(syncService.getSnapshot(mockResponderId).status).toBe('idle');
    });
  });

  describe('Scenario 2: Reconnect with one queued update', () => {
    it('automatically triggers sync on reconnect, sends update, acknowledges, and updates cache', async () => {
      const { syncService, queue, conn, api, cache } = createMockSyncEnv(false);

      // Enqueue an update while offline
      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);

      // Register authenticated session
      syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

      // Device transitions to online
      conn.emit({ isConnected: true, isInternetReachable: true });

      // Auto-sync executes in the background
      await vi.waitFor(() => {
        expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      });

      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
      expect(api.updateResponderRequestProgress).toHaveBeenCalledWith(
        mockRequestId,
        'DISPATCHED',
        mockToken,
        undefined
      );

      // Authoritative request cached
      expect(cache.updateCachedResponderRequest).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DISPATCHED' })
      );

      expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
      expect(syncService.getSnapshot(mockResponderId).syncedCount).toBe(1);
    });
  });

  describe('Scenario 3: Multiple queued lifecycle updates in strict FIFO order', () => {
    it('processes updates in exact creation order: DISPATCHED -> ARRIVED -> IN_PROGRESS', async () => {
      const { syncService, queue, conn, api, calls } = createMockSyncEnv(false);

      // Enqueue sequential lifecycle progress against baseRequest (which queue projects)
      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'ARRIVED' }
      });

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'IN_PROGRESS' }
      });

      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(3);

      syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });
      conn.emit({ isConnected: true, isInternetReachable: true });

      await vi.waitFor(() => {
        expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      });

      // Verify exact call order: DISPATCHED first, then ARRIVED, then IN_PROGRESS
      expect(calls.map((c) => c.args[1])).toEqual(['DISPATCHED', 'ARRIVED', 'IN_PROGRESS']);
      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(3);
      expect(syncService.getSnapshot(mockResponderId).syncedCount).toBe(3);
    });
  });

  describe('Scenario 4: Duplicate reconnect events / In-flight lock', () => {
    it('prevents multiple concurrent queue drains when multiple reconnect events fire rapidly', async () => {
      const { syncService, queue, conn, api } = createMockSyncEnv(false);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

      // Fire 4 rapid reconnect events
      conn.emit({ isConnected: true, isInternetReachable: true });
      conn.emit({ isConnected: true, isInternetReachable: true });
      conn.emit({ isConnected: true, isInternetReachable: true });
      conn.emit({ isConnected: true, isInternetReachable: true });

      await vi.waitFor(() => {
        expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      });

      // DISPATCHED should have been sent exactly once, not 4 times
      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 5: Temporary backend/network failure and controlled retry', () => {
    it('retains queued item on 500 error, applies controlled backoff, and succeeds on retry', async () => {
      const { syncService, queue, api } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      // Simulate server temporary failure
      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ApiClientError(500, 'INTERNAL_SERVER_ERROR', 'Temporary database outage')
      );

      const result = await syncService.syncQueue(mockResponderId, mockToken);

      expect(result.success).toBe(false);
      // Item must NOT be lost: retained in queue safely
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);
      expect(syncService.getSnapshot(mockResponderId).status).toBe('error');
      expect(syncService.getSnapshot(mockResponderId).lastError).toContain('Unable to sync updates right now');

      // Now server recovers; responder triggers manual retry
      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...baseRequest,
        status: 'DISPATCHED'
      });

      const retryResult = await syncService.retrySync(mockResponderId, mockToken);

      expect(retryResult.success).toBe(true);
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
    });
  });

  describe('Scenario 6: Internet drops during synchronization', () => {
    it('stops safely when connectivity drops, preserves remaining items, and resumes on next reconnect', async () => {
      const { syncService, queue, conn, api } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'ARRIVED' }
      });

      // First call succeeds, then connection drops on second call
      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(async () => {
          // Drop connection right after first operation
          conn.emit({ isConnected: false, isInternetReachable: false });
          return { ...baseRequest, status: 'DISPATCHED' };
        });

      await syncService.syncQueue(mockResponderId, mockToken);

      // First item dequeued, second item safely preserved
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);
      expect(queue.getSnapshot(mockResponderId).items[0]?.update.payload).toEqual({ status: 'ARRIVED' });
      expect(syncService.getSnapshot(mockResponderId).status).toBe('paused');

      syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

      // Connection restored later
      conn.emit({ isConnected: true, isInternetReachable: true });

      // Automatically drains remaining item
      await vi.waitFor(() => {
        expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      });

      expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
    });
  });

  describe('Scenario 7: Permanent lifecycle/validation failure', () => {
    it('halts queue drain on 403 authorization error without sending later dependent items', async () => {
      const { syncService, queue, api } = createMockSyncEnv(true);

      // Enqueue DISPATCHED and ARRIVED
      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'ARRIVED' }
      });

      // DISPATCHED fails with 403 (unassigned)
      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ApiClientError(403, 'REQUEST_NOT_ASSIGNED', 'Request no longer assigned to responder')
      );

      const result = await syncService.syncQueue(mockResponderId, mockToken);

      expect(result.success).toBe(false);
      // Both items retained: DISPATCHED halted processing
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(2);
      // ARRIVED must NEVER have been called because DISPATCHED failed!
      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
      expect(syncService.getSnapshot(mockResponderId).lastError).toContain('no longer assigned');

      // Subsequent sync attempt does not hammer backend
      await syncService.syncQueue(mockResponderId, mockToken);
      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 8: App/Component remount duplicate prevention', () => {
    it('reuses in-flight promise when remount triggers sync while previous sync is active', async () => {
      const { syncService, queue, api } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      let resolveApi!: (val: SafeResponseRequest) => void;
      const deferredPromise = new Promise<SafeResponseRequest>((resolve) => {
        resolveApi = resolve;
      });

      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce(deferredPromise);

      // First mount starts sync
      const firstSync = syncService.syncQueue(mockResponderId, mockToken);

      // Second mount / event calls sync while first is in-flight
      const secondSync = syncService.syncQueue(mockResponderId, mockToken);

      // Both should receive the exact same promise reference (lock check)
      expect(secondSync).toBe(firstSync);

      resolveApi({ ...baseRequest, status: 'DISPATCHED' });
      await firstSync;

      expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    });
  });

  describe('Scenario 9: Post-sync refresh and onSyncSuccess callback', () => {
    it('notifies onSyncSuccess with server-authoritative request records', async () => {
      const { syncService, queue } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      const onSyncSuccess = vi.fn();
      await syncService.syncQueue(mockResponderId, mockToken, { onSyncSuccess });

      expect(onSyncSuccess).toHaveBeenCalledTimes(1);
      expect(onSyncSuccess).toHaveBeenCalledWith([
        expect.objectContaining({ id: mockRequestId, status: 'DISPATCHED' })
      ]);
    });
  });

  describe('Scenario 10: Idempotent duplicate update check on 409 Conflict', () => {
    it('recovers cleanly when backend already applied the status during a previous lost connection', async () => {
      const { syncService, queue, api, cache } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'progress',
        payload: { status: 'DISPATCHED' }
      });

      // Server returns 409 because DB is already at DISPATCHED from earlier lost connection
      (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ApiClientError(409, 'INVALID_PROGRESS_TRANSITION', 'Already at DISPATCHED')
      );

      // Secondary lookup returns the request already at DISPATCHED
      (api.getResponderRequestById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...baseRequest,
        status: 'DISPATCHED'
      });

      const result = await syncService.syncQueue(mockResponderId, mockToken);

      // Should recover gracefully: acknowledge and dequeue item
      expect(result.success).toBe(true);
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      expect(cache.updateCachedResponderRequest).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DISPATCHED' })
      );
    });
  });

  describe('Field update synchronization', () => {
    it('synchronizes queued field updates and updates local cache', async () => {
      const { syncService, queue, api, cache } = createMockSyncEnv(true);

      await queue.enqueue(mockResponderId, baseRequest, {
        type: 'field-update',
        payload: { fieldNotes: 'Severe road flooding. Need boat.' }
      });

      await syncService.syncQueue(mockResponderId, mockToken);

      expect(api.saveResponderFieldUpdate).toHaveBeenCalledWith(
        mockRequestId,
        'Severe road flooding. Need boat.',
        mockToken
      );

      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
      expect(cache.updateCachedResponderRequest).toHaveBeenCalledWith(
        expect.objectContaining({ fieldNotes: 'Severe road flooding. Need boat.' })
      );
    });
  });
});
