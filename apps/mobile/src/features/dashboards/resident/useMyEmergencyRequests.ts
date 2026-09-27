import type { SafeResponseRequest } from '@safealert/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { listMyResponseRequests } from './api/responseRequestApi';

type RequestsState = {
  accessToken: string | null;
  requests: SafeResponseRequest[] | null;
  error: string | null;
};

export function useMyEmergencyRequests() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<RequestsState>({ accessToken: null, requests: null, error: null });
  const latestRead = useRef(0);
  const inFlightRead = useRef<number | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken?.trim()) return;
    // A ref guards rapid Retry/Refresh taps before React can disable the controls.
    if (inFlightRead.current !== null) return;
    const readId = ++latestRead.current;
    inFlightRead.current = readId;
    setState({ accessToken, requests: null, error: null });

    try {
      const { responseRequests } = await listMyResponseRequests(accessToken);
      if (readId === latestRead.current) setState({ accessToken, requests: responseRequests, error: null });
    } catch {
      if (readId === latestRead.current) {
        setState({ accessToken, requests: null, error: 'Unable to load your emergency requests right now.' });
      }
    } finally {
      if (inFlightRead.current === readId) inFlightRead.current = null;
    }
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    // Returning from details must read persisted responder updates, not retain a local status snapshot.
    void refetch();
    // Invalidate older reads on blur, unmount or session change so they cannot overwrite a newer read.
    return () => {
      latestRead.current += 1;
      inFlightRead.current = null;
    };
  }, [refetch]));

  if (!accessToken?.trim()) {
    return { requests: null, error: 'Your resident session is unavailable. Please log in again.', refetch, isRefreshing: false, canRefetch: false };
  }

  // Do not display a previous session's data while the new session starts loading.
  const current = state.accessToken === accessToken ? state : { requests: null, error: null };
  return { requests: current.requests, error: current.error, refetch, isRefreshing: current.requests === null && current.error === null, canRefetch: true };
}
