import type { SafeResponseRequest } from '@safealert/contracts';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!requestId || !accessToken?.trim()) return;
    let active = true;
    setState({ requestId, accessToken, request: null, error: null });

    void getMyResponseRequestById(requestId, accessToken).then(
      ({ responseRequest }) => {
        if (active) setState({ requestId, accessToken, request: responseRequest, error: null });
      },
      (error: unknown) => {
        if (active) setState({ requestId, accessToken, request: null, error: detailsErrorMessage(error) });
      }
    );

    // A late response must not populate a different request or a different signed-in session.
    return () => { active = false; };
  }, [requestId, accessToken]);

  if (!accessToken?.trim()) {
    return { request: null, error: 'Your resident session is unavailable. Please log in again.' };
  }
  if (!requestId) {
    return { request: null, error: 'Select a valid request from My Emergency Requests.' };
  }
  if (state?.requestId !== requestId || state.accessToken !== accessToken) {
    return { request: null, error: null };
  }
  return { request: state.request, error: state.error };
}

function detailsErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your session has expired. Please log in again.';
    // Do not distinguish someone else's request from one that does not exist.
    if (error.status === 403 || error.status === 404) return 'This emergency request is unavailable.';
  }
  return 'Unable to load your emergency request details right now.';
}
