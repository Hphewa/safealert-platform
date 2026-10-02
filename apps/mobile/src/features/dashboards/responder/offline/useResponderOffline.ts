import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import * as runtime from './responderOfflineRuntime';
import { OfflineUpdateError, type QueueSnapshot } from './responderUpdateQueue';
import { saveResponderUpdate } from './saveResponderUpdate';
import type { ResponderSyncService, SyncState } from './responderSyncService';

const responderConnectivity = runtime.responderConnectivity;
const responderUpdateQueue = runtime.responderUpdateQueue;
const responderSyncService = 'responderSyncService' in runtime
  ? (runtime as { responderSyncService?: ResponderSyncService }).responderSyncService
  : undefined;


const noAccount: QueueSnapshot = { items: [], status: 'error', error: null };
const defaultSyncState: SyncState = {
  status: 'idle',
  isSyncing: false,
  syncedCount: 0,
  lastError: null,
  lastSyncedAt: null
};

const fallbackSyncService = {
  subscribe: (listener: () => void) => { void listener; return () => {}; },
  getSnapshot: () => defaultSyncState,
  syncQueue: async () => ({ success: true, syncedRequests: [], syncedCount: 0, remainingCount: 0 }),
  retrySync: async () => ({ success: true, syncedRequests: [], syncedCount: 0, remainingCount: 0 }),
  setActiveSession: () => {},
  clearActiveSession: () => {}
};

export type ResponderOfflineOptions = {
  accessToken?: string | null;
  onSyncSuccess?: (syncedRequests: SafeResponseRequest[]) => void | Promise<void>;
};

export function useResponderOffline(
  user: SafeUser | null,
  contextKey: string,
  options?: ResponderOfflineOptions
) {
  const syncService = responderSyncService ?? fallbackSyncService;
  const owner = user?.role === 'EMERGENCY_RESPONDER' ? user.id : null;
  const scope = `${owner ?? ''}:${contextKey}`;
  const activeScope = useRef<string | null>(scope);
  activeScope.current = scope;

  // Unmount and account switch invalidation: ensures stale screens or callbacks
  // from previous sessions cannot commit updates or expose another responder's data.
  useEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = null;
    };
  }, [scope]);

  const isCurrent = () => activeScope.current === scope;

  // Subscribe to connectivity monitor
  const connectivity = useSyncExternalStore(
    responderConnectivity.subscribe,
    responderConnectivity.getSnapshot,
    () => 'unknown' as const
  );

  // Subscribe to persistent offline queue
  const snapshot = useSyncExternalStore(
    responderUpdateQueue.subscribe,
    useCallback(() => (owner ? responderUpdateQueue.getSnapshot(owner) : noAccount), [owner]),
    () => noAccount
  );

  // Subscribe to synchronization service state
  const syncState = useSyncExternalStore(
    syncService.subscribe,
    useCallback(() => (owner ? syncService.getSnapshot(owner) : defaultSyncState), [owner, syncService]),
    () => defaultSyncState
  );

  // Reload local queue from storage
  const reload = useCallback(async () => {
    if (owner) {
      await responderUpdateQueue.load(owner);
    }
  }, [owner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Extract access token from options or contextKey for authenticated operations
  const rawToken = options?.accessToken ?? (contextKey.includes(':') ? contextKey.split(':')[0] : contextKey);
  const token = typeof rawToken === 'string' && rawToken.trim() ? rawToken.trim() : null;

  const onSyncSuccess = options?.onSyncSuccess;

  // Register active responder session with the synchronization service.
  // This enables automatic background synchronization when connectivity transitions to online.
  useEffect(() => {
    if (owner && token) {
      syncService.setActiveSession({ owner, accessToken: token });
    }
    return () => {
      if (owner) {
        syncService.clearActiveSession(owner);
      }
    };
  }, [owner, token, syncService]);

  // Manual retry trigger for the responder when a previous sync attempt paused or errored
  const retrySync = useCallback(async () => {
    if (owner && token) {
      await syncService.retrySync(owner, token, {
        onSyncSuccess
      });
    }
  }, [owner, token, syncService, onSyncSuccess]);



  return {
    connectivity,
    ...snapshot,
    reload,
    isCurrent,
    saveUpdate: async (input: Parameters<typeof saveResponderUpdate>[0]) => {
      if (!isCurrent()) {
        throw new OfflineUpdateError('Reopen this request before saving an update.');
      }
      return saveResponderUpdate(input, responderUpdateQueue, responderConnectivity.getSnapshot);
    },
    // Synchronization state and controls
    syncStatus: syncState.status,
    isSyncing: syncState.isSyncing,
    syncError: syncState.lastError,
    lastSyncedAt: syncState.lastSyncedAt,
    retrySync
  };
}
