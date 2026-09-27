import type { SafeResponseRequest } from '@safealert/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ApiClientError } from '../../../services/api/client';
import { getMyResponseRequestById } from './api/responseRequestApi';
import { parseResidentEmergencyRequestId } from './emergencyRequestNavigation';

type DetailsState = {
  requestId: string;
  accessToken: string;
  request: SafeResponseRequest | null;
  error: string | null;
};

export function useMyEmergencyRequestDetails(routeId: string | string[] | undefined) {
  const { accessToken } = useAuth();
  const requestId = parseResidentEmergencyRequestId(routeId);
  const [state, setState] = useState<DetailsState | null>(null);
  const latestRead = useRef(0);

  const refetch = useCallback(async () => {
    const readId = ++latestRead.current;
    if (!requestId || !accessToken?.trim()) return;
    setState({ requestId, accessToken, request: null, error: null });

    try {
      const { responseRequest } = await getMyResponseRequestById(requestId, accessToken);
      if (readId === latestRead.current) setState({ requestId, accessToken, request: responseRequest, error: null });
    } catch (error) {
      if (readId === latestRead.current) setState({ requestId, accessToken, request: null, error: detailsErrorMessage(error) });
    }
  }, [requestId, accessToken]);

  useFocusEffect(useCallback(() => {
    // Refetch the same backend request so the status heading and tracker share responder-confirmed progress.
    void refetch();
    // Ignore late responses from a previous focus, request ID or authenticated session.
    return () => { latestRead.current += 1; };
  }, [refetch]));

  if (!accessToken?.trim()) {
    return { request: null, error: 'Your resident session is unavailable. Please log in again.', refetch, isRefreshing: false };
  }
  if (!requestId) {
    return { request: null, error: 'Select a valid request from My Emergency Requests.', refetch, isRefreshing: false };
  }
  if (state?.requestId !== requestId || state.accessToken !== accessToken) {
    return { request: null, error: null, refetch, isRefreshing: true };
  }
  return { request: state.request, error: state.error, refetch, isRefreshing: state.request === null && state.error === null };
}

function detailsErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your session has expired. Please log in again.';
    // Do not distinguish someone else's request from one that does not exist.
    if (error.status === 403 || error.status === 404) return 'This emergency request is unavailable.';
  }
  return 'Unable to load your emergency request details right now.';
}
