import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { SafeUser } from '@safealert/contracts';
import { responderConnectivity, responderUpdateQueue } from './responderOfflineRuntime';
import { OfflineUpdateError, type QueueSnapshot } from './responderUpdateQueue';
import { saveResponderUpdate } from './saveResponderUpdate';

const noAccount: QueueSnapshot = { items: [], status: 'error', error: null };

export function useResponderOffline(user: SafeUser | null, contextKey: string) {
  const owner = user?.role === 'EMERGENCY_RESPONDER' ? user.id : null;
  const scope = `${owner ?? ''}:${contextKey}`;
  const activeScope = useRef<string | null>(scope);
  activeScope.current = scope;
  useEffect(() => {
    activeScope.current = scope;
    return () => { activeScope.current = null; };
  }, [scope]);
  const isCurrent = () => activeScope.current === scope;
  const connectivity = useSyncExternalStore(responderConnectivity.subscribe, responderConnectivity.getSnapshot, () => 'unknown' as const);
  const snapshot = useSyncExternalStore(responderUpdateQueue.subscribe,
    useCallback(() => owner ? responderUpdateQueue.getSnapshot(owner) : noAccount, [owner]), () => noAccount);
  const reload = useCallback(async () => {
    if (owner) {
      // Storage failures are returned as a visible state, without losing the persisted queue.
      await responderUpdateQueue.load(owner);
    }
  }, [owner]);
  useEffect(() => { void reload(); }, [reload]);
  return {
    connectivity, ...snapshot, reload, isCurrent,
    saveUpdate: async (input: Parameters<typeof saveResponderUpdate>[0]) => {
      if (!isCurrent()) throw new OfflineUpdateError('Reopen this request before saving an update.');
      return saveResponderUpdate(input, responderUpdateQueue, responderConnectivity.getSnapshot);
    }
  };
}
