import type { SafeResponseRequest } from '@safealert/contracts';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    setState({ accessToken, requests: null, error: null });
    void listMyResponseRequests(accessToken).then(
      ({ responseRequests }) => {
        if (active) setState({ accessToken, requests: responseRequests, error: null });
      },
      () => {
        if (active) {
          setState({ accessToken, requests: null, error: 'Unable to load your emergency requests right now.' });
        }
      }
    );

    // Ignore late responses after leaving the screen or changing the authenticated session.
    return () => { active = false; };
  }, [accessToken]);

  if (!accessToken) {
    return { requests: null, error: 'Your resident session is unavailable. Please log in again.' };
  }

  // Do not display a previous session's data while the new session starts loading.
  return state.accessToken === accessToken ? state : { requests: null, error: null };
}
