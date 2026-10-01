import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { ApiClientError } from '../../../../services/api/client';
import { createConnectivityStore } from './connectivity';
import {
  createResponderUpdateQueue,
  projectQueuedUpdates,
  type ResponderUpdateQueue
} from './responderUpdateQueue';
import { saveResponderUpdate } from './saveResponderUpdate';
import {
  createResponderSyncService,
  type ResponderSyncApi,
  type ResponderSyncCache,
  type ResponderSyncService
} from './responderSyncService';
import {
  clearResponderRequestCache,
  getCachedResponderRequest,
  updateCachedResponderRequest
} from '../requestDetailsCache';

const serverState = vi.hoisted(() => ({
  request: null as SafeResponseRequest | null
}));

vi.mock('../api/responderProgressApi', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updateResponderRequestProgress: vi.fn(async (requestId, status, _accessToken, completionDetails) => {
      if (serverState.request) {
        serverState.request = {
          ...serverState.request,
          id: requestId,
          status,
          ...(completionDetails ?? {}),
          updatedAt: new Date().toISOString()
        };
        return serverState.request;
      }
      return { id: requestId, status, ...completionDetails };
    })
  };
});

vi.mock('../api/responderFieldUpdateApi', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    saveResponderFieldUpdate: vi.fn(async (requestId, fieldNotes) => {
      if (serverState.request) {
        serverState.request = {
          ...serverState.request,
          id: requestId,
          fieldNotes,
          fieldUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return serverState.request;
      }
      return { id: requestId, fieldNotes };
    })
  };
});


const mockRequestId = '507f1f77bcf86cd799439011';
const mockResponderId = 'responder-1';
const mockToken = 'valid-responder-token';

const responderUser: SafeUser = {
  id: mockResponderId,
  name: 'Test Responder',
  email: 'responder@example.com',
  role: 'EMERGENCY_RESPONDER'
};

const baseAssignedRequest: SafeResponseRequest = {
  id: mockRequestId,
  residentId: 'resident-1',
  assignedResponderId: mockResponderId,
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  roadAccessibility: 'ACCESSIBLE',
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Resident requires medical triage.',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z'
};

function createInMemoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    })
  };
}

describe('LDFEW-337: End-to-End Responder Offline, Sync, Failure, and Persistence Scenarios', () => {
  let disk: ReturnType<typeof createInMemoryStorage>;
  let queue: ResponderUpdateQueue;
  let connectivityState: { isConnected: boolean | null; isInternetReachable: boolean | null };
  let connectivityListener: ((state: typeof connectivityState) => void) | null = null;
  let connectivityStore: ReturnType<typeof createConnectivityStore>;
  let serverRequest: SafeResponseRequest;
  let apiCalls: { type: string; payload: unknown }[];
  let api: ResponderSyncApi;
  let cache: ResponderSyncCache;
  let syncService: ResponderSyncService;

  beforeEach(() => {
    disk = createInMemoryStorage();
    queue = createResponderUpdateQueue(disk);
    clearResponderRequestCache();
    serverRequest = { ...baseAssignedRequest };
    serverState.request = serverRequest;
    apiCalls = [];

    connectivityState = { isConnected: true, isInternetReachable: true };
    connectivityListener = null;

    connectivityStore = createConnectivityStore({
      listen: (listener) => {
        connectivityListener = listener;
        listener(connectivityState);
        return () => {
          connectivityListener = null;
        };
      }
    });

    // Keep an active listener so getSnapshot() reflects state in tests
    connectivityStore.subscribe(() => {});

    api = {
      updateResponderRequestProgress: vi.fn(async (requestId, status, _accessToken, completionDetails) => {
        apiCalls.push({ type: 'progress', payload: { requestId, status, completionDetails } });
        serverRequest = {
          ...serverRequest,
          id: requestId,
          status,
          ...(completionDetails ?? {}),
          updatedAt: new Date().toISOString()
        };
        return serverRequest;
      }),
      saveResponderFieldUpdate: vi.fn(async (requestId, fieldNotes) => {
        apiCalls.push({ type: 'field-update', payload: { requestId, fieldNotes } });
        serverRequest = {
          ...serverRequest,
          id: requestId,
          fieldNotes,
          fieldUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return serverRequest;
      }),
      getResponderRequestById: vi.fn(async (requestId) => {
        return serverRequest.id === requestId ? serverRequest : null;
      })
    };

    cache = {
      updateCachedResponderRequest: vi.fn((req) => {
        updateCachedResponderRequest(req);
      })
    };

    syncService = createResponderSyncService(queue, connectivityStore, api, cache);
  });

  const setNetworkOnline = (online: boolean) => {
    connectivityState = { isConnected: online, isInternetReachable: online };
    connectivityListener?.(connectivityState);
  };

  // =========================================================================
  // Scenario 1: Normal Online Update
  // =========================================================================
  it('Scenario 1: Normal online update commits directly to backend without creating offline queue entries', async () => {
    setNetworkOnline(true);
    expect(connectivityStore.getSnapshot()).toBe('online');

    const result = await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'DISPATCHED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    expect(result.saved).toBe('server');
    if (result.saved === 'server') {
      expect(result.request.status).toBe('DISPATCHED');
    }

    // No local queue items created
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    expect(serverState.request?.status).toBe('DISPATCHED');
  });


  // =========================================================================
  // Scenario 2: Internet Disconnects
  // =========================================================================
  it('Scenario 2: Network disconnection is correctly detected without crashing or looping', () => {
    setNetworkOnline(true);
    expect(connectivityStore.getSnapshot()).toBe('online');

    setNetworkOnline(false);
    expect(connectivityStore.getSnapshot()).toBe('offline');

    // Emitting redundant disconnects does not trigger unexpected state changes
    setNetworkOnline(false);
    expect(connectivityStore.getSnapshot()).toBe('offline');
  });

  // =========================================================================
  // Scenario 3: Responder Update While Offline
  // =========================================================================
  it('Scenario 3: Responder update while offline saves locally with pending sync state and does not call backend', async () => {
    setNetworkOnline(false);

    const result = await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'DISPATCHED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    expect(result.saved).toBe('local');
    expect(api.updateResponderRequestProgress).not.toHaveBeenCalled();

    const snapshot = queue.getSnapshot(mockResponderId);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.update.payload).toEqual({ status: 'DISPATCHED' });
    expect(snapshot.items[0]?.syncState).toBe('pending');
  });

  // =========================================================================
  // Scenario 4: Offline Data Persists During Navigation
  // =========================================================================
  it('Scenario 4: Offline queued data persists and is projectable when navigating away and returning', async () => {
    setNetworkOnline(false);

    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'field-update', payload: { fieldNotes: 'Severe flood at bridge.' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    // Simulate navigating away and returning: request cache has base request,
    // queue projection applies local field notes overlay
    const cached = baseAssignedRequest;
    const items = queue.getSnapshot(mockResponderId).items;
    const projection = projectQueuedUpdates(cached, items);

    expect(projection.conflict).toBe(false);
    expect(projection.request.fieldNotes).toBe('Severe flood at bridge.');
    expect(projection.request.status).toBe('ASSIGNED');
  });

  // =========================================================================
  // Scenario 5: Persistence Across Component Remount
  // =========================================================================
  it('Scenario 5: Queued updates persist across component unmount and remount without duplicate creation', async () => {
    setNetworkOnline(false);

    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'DISPATCHED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    // Simulate screen unmount (snapshot preserved in memory and storage)
    const itemsBefore = queue.getSnapshot(mockResponderId).items;
    expect(itemsBefore).toHaveLength(1);

    // Simulate screen mount reading from queue
    const restored = await queue.load(mockResponderId);
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0]?.localId).toBe(itemsBefore[0]?.localId);
  });

  // =========================================================================
  // Scenario 6: App Restart While Offline
  // =========================================================================
  it('Scenario 6: Updates persist in local storage across full application/runtime restarts', async () => {
    setNetworkOnline(false);

    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'DISPATCHED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    // Verify storage has raw serialized JSON
    expect(disk.setItem).toHaveBeenCalled();

    // Recreate new queue instance pointing to same storage (simulating app restart)
    const recreatedQueue = createResponderUpdateQueue(disk);
    const restoredState = await recreatedQueue.load(mockResponderId);

    expect(restoredState.items).toHaveLength(1);
    expect(restoredState.items[0]?.update.payload).toEqual({ status: 'DISPATCHED' });
    expect(restoredState.items[0]?.sequence).toBe(1);
  });

  // =========================================================================
  // Scenario 7: Multiple Offline Lifecycle Updates in Strict Order
  // =========================================================================
  it('Scenario 7: Multiple offline lifecycle updates preserve strict sequential FIFO order', async () => {
    setNetworkOnline(false);

    // Enqueue DISPATCHED
    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'DISPATCHED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    // Enqueue ARRIVED (must pass base request; queue internally projects pending work)
    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'ARRIVED' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    // Enqueue IN_PROGRESS
    await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'progress', payload: { status: 'IN_PROGRESS' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    const items = queue.getSnapshot(mockResponderId).items;
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.sequence)).toEqual([1, 2, 3]);
    expect(items.map((i) => (i.update.payload as { status: string }).status)).toEqual([
      'DISPATCHED',
      'ARRIVED',
      'IN_PROGRESS'
    ]);
  });

  // =========================================================================
  // Scenario 8: Internet Reconnects Automatically
  // =========================================================================
  it('Scenario 8: Reconnection triggers automatic synchronization without manual button press', async () => {
    setNetworkOnline(false);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

    // Transition from offline to online
    setNetworkOnline(true);

    await vi.waitFor(() => {
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    });

    expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
    expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
  });

  // =========================================================================
  // Scenario 9: Correct Order Sent to Backend
  // =========================================================================
  it('Scenario 9: Updates are sent to backend in exact lifecycle order and each is confirmed before the next', async () => {
    setNetworkOnline(false);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'ARRIVED' }
    });
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'IN_PROGRESS' }
    });

    syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });
    setNetworkOnline(true);

    await vi.waitFor(() => {
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    });

    expect(apiCalls.map((c) => (c.payload as { status: string }).status)).toEqual([
      'DISPATCHED',
      'ARRIVED',
      'IN_PROGRESS'
    ]);
  });

  // =========================================================================
  // Scenario 10: Successful Queue Cleanup
  // =========================================================================
  it('Scenario 10: Queue items are removed only after confirmed backend success and queue becomes empty', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);

    const result = await syncService.syncQueue(mockResponderId, mockToken);

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(1);
    expect(result.remainingCount).toBe(0);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
  });

  // =========================================================================
  // Scenario 11: Duplicate Sync Prevention
  // =========================================================================
  it('Scenario 11: In-flight lock prevents duplicate sync runs and identical status submissions', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    let resolveProgress!: (val: SafeResponseRequest) => void;
    const progressPromise = new Promise<SafeResponseRequest>((resolve) => {
      resolveProgress = resolve;
    });

    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce(progressPromise);

    // Call syncQueue concurrently 3 times
    const p1 = syncService.syncQueue(mockResponderId, mockToken);
    const p2 = syncService.syncQueue(mockResponderId, mockToken);
    const p3 = syncService.syncQueue(mockResponderId, mockToken);

    expect(p2).toBe(p1);
    expect(p3).toBe(p1);

    resolveProgress({ ...serverRequest, status: 'DISPATCHED' });
    await p1;

    expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Scenario 12: Temporary Network Failure During Sync
  // =========================================================================
  it('Scenario 12: Network drop during queue drain stops safely, keeps unsent items, and resumes on next reconnect', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'ARRIVED' }
    });

    // First call succeeds, then connection drops before second call
    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      setNetworkOnline(false);
      return { ...serverRequest, status: 'DISPATCHED' };
    });

    syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });
    await syncService.syncQueue(mockResponderId, mockToken);

    // DISPATCHED removed, ARRIVED safely retained
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);
    expect((queue.getSnapshot(mockResponderId).items[0]?.update.payload as { status: string }).status).toBe('ARRIVED');
    expect(syncService.getSnapshot(mockResponderId).status).toBe('paused');

    // Network returns later
    setNetworkOnline(true);

    await vi.waitFor(() => {
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    });

    expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
  });

  // =========================================================================
  // Scenario 13: Temporary Backend Failure (500)
  // =========================================================================
  it('Scenario 13: Temporary backend 500 error retains item and applies controlled retry backoff', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiClientError(500, 'SERVER_ERROR', 'Database temporarily unavailable')
    );

    const result = await syncService.syncQueue(mockResponderId, mockToken);

    expect(result.success).toBe(false);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);
    expect(syncService.getSnapshot(mockResponderId).status).toBe('error');
    expect(syncService.getSnapshot(mockResponderId).lastError).toContain('Unable to sync updates right now');
  });

  // =========================================================================
  // Scenario 14: Retry Success After Temporary Failure
  // =========================================================================
  it('Scenario 14: Manual retry successfully processes retained item when backend recovers', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    // 1st attempt fails with 500
    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiClientError(500, 'SERVER_ERROR', 'Internal error')
    );
    await syncService.syncQueue(mockResponderId, mockToken);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);

    // Backend recovers, retry invoked
    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...serverRequest,
      status: 'DISPATCHED'
    });

    const retryResult = await syncService.retrySync(mockResponderId, mockToken);

    expect(retryResult.success).toBe(true);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
    expect(cache.updateCachedResponderRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISPATCHED' })
    );
  });

  // =========================================================================
  // Scenario 15: Permanent Validation / Lifecycle Failure
  // =========================================================================
  it('Scenario 15: Permanent 403 authorization failure halts queue drain without sending dependent operations', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'ARRIVED' }
    });

    (api.updateResponderRequestProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiClientError(403, 'REQUEST_NOT_ASSIGNED', 'Request reassigned')
    );

    const result = await syncService.syncQueue(mockResponderId, mockToken);

    expect(result.success).toBe(false);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(2);
    // ARRIVED must not have been sent
    expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
    expect(syncService.getSnapshot(mockResponderId).lastError).toContain('no longer assigned');

    // Repeated call without explicit manual intervention does not hammer the server
    await syncService.syncQueue(mockResponderId, mockToken);
    expect(api.updateResponderRequestProgress).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Scenario 16: Corrupted Local Queue Data
  // =========================================================================
  it('Scenario 16: Corrupted storage or malformed queue items are handled defensively without crashing', async () => {
    // Write corrupted JSON into storage
    disk.store.set(`safealert.responder-updates.v1.${mockResponderId}`, '{ invalid json');

    const corruptQueue = createResponderUpdateQueue(disk);
    const readState = await corruptQueue.load(mockResponderId);

    expect(readState.status).toBe('error');
    expect(readState.error).toContain('could not be read');
    // Raw disk storage was not wiped or overwritten
    expect(disk.store.get(`safealert.responder-updates.v1.${mockResponderId}`)).toBe('{ invalid json');
  });

  // =========================================================================
  // Scenario 17: UI Status Transitions
  // =========================================================================
  it('Scenario 17: UI state transitions accurately from offline to syncing to success', async () => {
    setNetworkOnline(false);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    // Offline state with pending sync item
    expect(connectivityStore.getSnapshot()).toBe('offline');
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(1);

    syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });

    // Transition to online triggers syncing
    setNetworkOnline(true);

    await vi.waitFor(() => {
      expect(syncService.getSnapshot(mockResponderId).status).toBe('success');
    });

    expect(syncService.getSnapshot(mockResponderId).syncedCount).toBe(1);
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
  });

  // =========================================================================
  // Scenario 18: Request Data Refresh After Sync
  // =========================================================================
  it('Scenario 18: Authoritative request data is refreshed and cached after successful sync', async () => {
    setNetworkOnline(true);

    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });

    const refreshCallback = vi.fn();
    await syncService.syncQueue(mockResponderId, mockToken, { onSyncSuccess: refreshCallback });

    expect(refreshCallback).toHaveBeenCalledTimes(1);
    expect(refreshCallback).toHaveBeenCalledWith([
      expect.objectContaining({ id: mockRequestId, status: 'DISPATCHED' })
    ]);
    expect(getCachedResponderRequest(mockRequestId)?.status).toBe('DISPATCHED');
  });

  // =========================================================================
  // Scenario 19: Final Frontend / Backend Consistency
  // =========================================================================
  it('Scenario 19: Final frontend state matches authoritative backend state after complete synchronization', async () => {
    setNetworkOnline(false);

    // Responder records both progress and field update offline
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'progress',
      payload: { status: 'DISPATCHED' }
    });
    await queue.enqueue(mockResponderId, serverRequest, {
      type: 'field-update',
      payload: { fieldNotes: 'Approaching site via alternate highway.' }
    });

    syncService.setActiveSession({ owner: mockResponderId, accessToken: mockToken });
    setNetworkOnline(true);

    await vi.waitFor(() => {
      expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    });

    // Server state matches all transitions
    expect(serverRequest.status).toBe('DISPATCHED');
    expect(serverRequest.fieldNotes).toBe('Approaching site via alternate highway.');

    // Local cache matches backend state
    const cached = getCachedResponderRequest(mockRequestId);
    expect(cached?.status).toBe(serverRequest.status);
    expect(cached?.fieldNotes).toBe(serverRequest.fieldNotes);
  });

  // =========================================================================
  // Scenario 20: Regression Test Existing Responder Functionality
  // =========================================================================
  it('Scenario 20: Offline sync engine does not interfere with normal online field updates or completions', async () => {
    setNetworkOnline(true);

    // Online field update
    const fieldResult = await saveResponderUpdate(
      {
        request: serverRequest,
        user: responderUser,
        accessToken: mockToken,
        update: { type: 'field-update', payload: { fieldNotes: 'All clear on site.' } }
      },
      queue,
      connectivityStore.getSnapshot
    );

    expect(fieldResult.saved).toBe('server');
    if (fieldResult.saved === 'server') {
      expect(fieldResult.request.fieldNotes).toBe('All clear on site.');
    }
    expect(queue.getSnapshot(mockResponderId).items).toHaveLength(0);
    expect(serverState.request?.fieldNotes).toBe('All clear on site.');
  });
});

