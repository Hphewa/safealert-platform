import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '../../../services/api/client';
import { listPendingResponderRequests } from './api/responderRequestsApi';
import { getResponderQueueCounts } from './queueState';
import { useResponderAssignments } from './useResponderAssignments';

type AvailableState = {
  scope: string;
  count: number | null;
  status: 'loading' | 'ready' | 'error' | 'offline';
  refreshing: boolean;
  error: string | null;
};

export function useResponderProfileActivity() {
  const { user, accessToken } = useAuth();
  // Reuse Active's ownership, lifecycle and local-update projection rather than counting a second assignment list.
  const assignments = useResponderAssignments('active');
  const owner = user?.role === 'EMERGENCY_RESPONDER' ? user.id : null;
  const scope = `${owner ?? ''}:${accessToken ?? ''}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const readId = useRef(0);
  const inFlight = useRef<number | null>(null);
  const [available, setAvailable] = useState<AvailableState>({ scope, count: null, status: 'loading', refreshing: false, error: null });

  const refreshAvailable = useCallback(async () => {
    if (!owner || !accessToken || inFlight.current !== null) return;
    const id = ++readId.current;
    inFlight.current = id;
    try {
      if (assignments.offline.connectivity === 'offline') {
        // Pending availability can change while disconnected; never present an invented offline count.
        setAvailable({ scope, count: null, status: 'offline', refreshing: false, error: null });
        return;
      }
      setAvailable({ scope, count: null, status: 'loading', refreshing: true, error: null });
      const pending = await listPendingResponderRequests(accessToken);
      if (readId.current !== id || currentScope.current !== scope) return;
      const visible = pending.filter((request) => !(request.declinedByResponderIds ?? []).includes(owner));
      const count = getResponderQueueCounts({ pending: visible, assigned: [] }).PENDING;
      setAvailable({ scope, count, status: 'ready', refreshing: false, error: null });
    } catch (error) {
      if (readId.current !== id || currentScope.current !== scope) return;
      setAvailable({ scope, count: null, status: 'error', refreshing: false,
        error: error instanceof ApiClientError && error.status === 401
          ? 'Your session has expired. Please log in again.'
          : 'Unable to load available requests. Please retry.' });
    } finally {
      if (inFlight.current === id) inFlight.current = null;
    }
  }, [owner, accessToken, scope, assignments.offline.connectivity]);

  useFocusEffect(useCallback(() => {
    void refreshAvailable();
    return () => { readId.current += 1; inFlight.current = null; };
  }, [refreshAvailable]));

  useEffect(() => {
    if (assignments.offline.syncStatus === 'success') void refreshAvailable();
  }, [assignments.offline.syncStatus, refreshAvailable]);

  const scoped = available.scope === scope;
  return {
    ...assignments,
    availableCount: scoped && assignments.offline.connectivity !== 'offline' ? available.count : null,
    availableLoading: Boolean(owner && accessToken) && assignments.offline.connectivity !== 'offline' && (!scoped || available.status === 'loading'),
    availableError: scoped ? available.error : null,
    activeCount: assignments.loading || assignments.error ? null : assignments.requests.length,
    refreshing: assignments.refreshing || (scoped && available.refreshing),
    refresh: () => Promise.all([assignments.refresh(), refreshAvailable()])
  };
}
