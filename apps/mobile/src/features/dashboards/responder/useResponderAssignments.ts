import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SafeResponseRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '../../../services/api/client';
import { listAssignedResponderRequests, listCompletedResponderRequests } from './api/responderRequestsApi';
import { getCachedAssignedResponderRequests, getCachedResponderRequest, updateCachedResponderRequest } from './requestDetailsCache';
import { getOwnedResponderAssignments } from './queueState';
import { projectQueuedUpdates } from './offline/responderUpdateQueue';
import { useResponderOffline } from './offline/useResponderOffline';
import type { ResponderAssignmentView } from './requestDetails';

type AssignmentState = {
  scope: string;
  requests: SafeResponseRequest[];
  status: 'loading' | 'ready' | 'error';
  refreshing: boolean;
  error: string | null;
};

export function useResponderAssignments(view: ResponderAssignmentView) {
  const { accessToken, user } = useAuth();
  const owner = user?.role === 'EMERGENCY_RESPONDER' ? user.id : null;
  const completed = view === 'history';
  const scope = `${owner ?? ''}:${accessToken ?? ''}:${completed}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const readId = useRef(0);
  const inFlight = useRef<number | null>(null);
  const [state, setState] = useState<AssignmentState>({ scope, requests: [], status: 'loading', refreshing: false, error: null });
  const offline = useResponderOffline(user, accessToken ?? '', { accessToken });

  const refresh = useCallback(async () => {
    if (!owner || !accessToken?.trim() || inFlight.current !== null) return;
    const id = ++readId.current;
    inFlight.current = id;
    const isCurrent = () => readId.current === id && activeScope.current === scope;
    setState((current) => current.scope === scope
      ? { ...current, refreshing: true, error: null }
      : { scope, requests: [], status: 'loading', refreshing: true, error: null });
    try {
      // Offline screens reuse only this responder's server-confirmed cache, never Pending data.
      const requests = offline.connectivity === 'offline'
        ? getCachedAssignedResponderRequests(owner)
        : await (completed ? listCompletedResponderRequests(accessToken) : listAssignedResponderRequests(accessToken));
      if (!isCurrent()) return;
      const owned = getOwnedResponderAssignments(requests, owner, completed);
      owned.forEach(updateCachedResponderRequest);
      setState({ scope, requests: owned, status: 'ready', refreshing: false, error: null });
    } catch (error) {
      if (!isCurrent()) return;
      const cached = getOwnedResponderAssignments(getCachedAssignedResponderRequests(owner), owner, completed);
      const showCache = offline.connectivity === 'unknown' && cached.length > 0;
      setState({
        scope, requests: showCache ? cached : [], status: showCache ? 'ready' : 'error', refreshing: false,
        error: error instanceof ApiClientError && error.status === 401
          ? 'Your session has expired. Please log in again.'
          : showCache ? 'Unable to refresh. Showing previously loaded responses.'
            : 'Unable to load responses. Check your connection and try again.'
      });
    } finally {
      if (inFlight.current === id) inFlight.current = null;
    }
  }, [owner, accessToken, scope, completed, offline.connectivity]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { readId.current += 1; inFlight.current = null; };
  }, [refresh]));

  // Re-read after synchronization so local completion cannot return to an active list.
  useEffect(() => {
    if (offline.syncStatus === 'success') void refresh();
  }, [offline.syncStatus, refresh]);

  const requests = useMemo(() => {
    if (!owner || state.scope !== scope) return [];
    const confirmed = state.requests.map((request) => {
      const cached = getCachedResponderRequest(request.id);
      return cached?.assignedResponderId === owner ? cached : request;
    });
    // History contains acknowledged completions only; unsynced completion leaves Active immediately.
    const effective = completed ? confirmed : confirmed.map((request) => projectQueuedUpdates(request, offline.items).request);
    return getOwnedResponderAssignments(effective, owner, completed);
  }, [owner, scope, state, completed, offline.items, offline.syncStatus]);

  const available = Boolean(owner && accessToken?.trim());
  return {
    requests, offline, refresh,
    loading: available && (state.scope !== scope || state.status === 'loading'),
    refreshing: state.scope === scope && state.refreshing,
    error: available ? state.scope === scope ? state.error : null : 'Your responder session is unavailable. Please log in again.',
    canRefresh: available
  };
}
