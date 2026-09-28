import { RESPONSE_CANCELLABLE_STATUS, type SafeResponseRequest } from '@safealert/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ApiClientError } from '../../../services/api/client';
import { cancelResidentResponseRequest, getMyResponseRequestById } from './api/responseRequestApi';
import { parseResidentEmergencyRequestId } from './emergencyRequestNavigation';

type DetailsState = {
  requestId: string;
  accessToken: string;
  request: SafeResponseRequest | null;
  error: string | null;
};

type CancellationConfirmation = { requestId: string; accessToken: string; readId: number };

export function useMyEmergencyRequestDetails(routeId: string | string[] | undefined) {
  const { accessToken } = useAuth();
  const requestId = parseResidentEmergencyRequestId(routeId);
  const [state, setState] = useState<DetailsState | null>(null);
  const latestRead = useRef(0);
  const inFlightRead = useRef<number | null>(null);
  const [confirmation, setConfirmation] = useState<CancellationConfirmation | null>(null);
  const confirmationRef = useRef<CancellationConfirmation | null>(null);
  const cancelInFlight = useRef<CancellationConfirmation | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const context = useRef({ requestId, accessToken });
  context.current = { requestId, accessToken };

  const keepRequest = () => {
    if (cancelInFlight.current) return;
    confirmationRef.current = null;
    setConfirmation(null);
  };

  const refetch = useCallback(async () => {
    if (!requestId || !accessToken?.trim()) return;
    // Retry and header Refresh share one in-flight read, including taps before the next render.
    const pendingCancellation = cancelInFlight.current;
    if (inFlightRead.current !== null || (pendingCancellation?.requestId === requestId
      && pendingCancellation.accessToken === accessToken)) return;
    confirmationRef.current = null;
    setConfirmation(null);
    const readId = ++latestRead.current;
    inFlightRead.current = readId;
    setState({ requestId, accessToken, request: null, error: null });

    try {
      const { responseRequest } = await getMyResponseRequestById(requestId, accessToken);
      if (readId === latestRead.current) setState({ requestId, accessToken, request: responseRequest, error: null });
    } catch (error) {
      if (readId === latestRead.current) setState({ requestId, accessToken, request: null, error: detailsErrorMessage(error) });
    } finally {
      if (inFlightRead.current === readId) inFlightRead.current = null;
    }
  }, [requestId, accessToken]);

  useFocusEffect(useCallback(() => {
    // Refetch the same backend request so the status heading and tracker share responder-confirmed progress.
    void refetch();
    // Ignore late responses from a previous focus, request ID or authenticated session.
    return () => {
      latestRead.current += 1;
      inFlightRead.current = null;
      confirmationRef.current = null;
    };
  }, [refetch]));

  // Share the backend's NEW-only rule for visibility and confirmation; unknown
  // statuses fail closed rather than becoming an alternative cancellation path.
  const canCancel = !!requestId && !!accessToken?.trim() && state?.requestId === requestId
    && state.accessToken === accessToken && !state.error && inFlightRead.current === null
    && parseResidentEmergencyRequestId(state.request?.id) === requestId
    && state.request?.status === RESPONSE_CANCELLABLE_STATUS;

  const openCancellationConfirmation = () => {
    if (!canCancel || !requestId || !accessToken || cancelInFlight.current || confirmationRef.current
      || inFlightRead.current !== null || requestId !== context.current.requestId
      || accessToken !== context.current.accessToken) return;
    const next = { requestId, accessToken, readId: latestRead.current };
    confirmationRef.current = next;
    setConfirmation(next);
  };

  const confirmCancellation = async () => {
    const pending = confirmationRef.current;
    // A dialog authorizes only the request/session/read that opened it. Refresh,
    // navigation or session changes must not reuse an obsolete confirmation.
    if (!pending || pending !== confirmation || !canCancel || cancelInFlight.current
      || pending.requestId !== context.current.requestId || pending.accessToken !== context.current.accessToken
      || pending.readId !== latestRead.current) return;
    // Lock synchronously, before React rerenders, to prevent double submissions.
    cancelInFlight.current = pending;
    setIsCancelling(true);
    const isCurrent = () => pending.readId === latestRead.current
      && pending.requestId === context.current.requestId && pending.accessToken === context.current.accessToken;
    try {
      // Local NEW data can be stale; backend ownership/status checks remain authoritative.
      const { responseRequest } = await cancelResidentResponseRequest(pending.requestId, pending.accessToken);
      if (isCurrent()) setState({ requestId: pending.requestId, accessToken: pending.accessToken, request: responseRequest, error: null });
    } catch (error) {
      // An uncertain write must be reread via Retry before offering another cancellation.
      // Never display raw transport/database messages or automatically repeat the mutation.
      if (isCurrent()) setState({
        requestId: pending.requestId, accessToken: pending.accessToken, request: null,
        error: error instanceof ApiClientError && error.status === 409
          ? 'This request has changed and can no longer be cancelled. Refresh its details.'
          : 'Unable to confirm cancellation. Reload the request details before trying again.'
      });
    } finally {
      cancelInFlight.current = null;
      confirmationRef.current = null;
      setConfirmation(null);
      setIsCancelling(false);
    }
  };
  const cancellation = {
    openCancellationConfirmation, keepRequest, confirmCancellation, isCancelling,
    canCancelRequest: canCancel && !isCancelling,
    isConfirmationOpen: canCancel && confirmation !== null && confirmation === confirmationRef.current
      && confirmation.requestId === requestId && confirmation.accessToken === accessToken
      && confirmation.readId === latestRead.current
  };

  if (!accessToken?.trim()) {
    return { ...cancellation, request: null, error: 'Your resident session is unavailable. Please log in again.', refetch, isRefreshing: false, canRefetch: false };
  }
  if (!requestId) {
    return { ...cancellation, request: null, error: 'Select a valid request from My Emergency Requests.', refetch, isRefreshing: false, canRefetch: false };
  }
  if (state?.requestId !== requestId || state.accessToken !== accessToken) {
    return { ...cancellation, request: null, error: null, refetch, isRefreshing: true, canRefetch: true };
  }
  return { ...cancellation, request: state.request, error: state.error, refetch, isRefreshing: state.request === null && state.error === null, canRefetch: !isCancelling };
}

function detailsErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Your session has expired. Please log in again.';
    // Do not distinguish someone else's request from one that does not exist.
    if (error.status === 403 || error.status === 404) return 'This emergency request is unavailable.';
  }
  return 'Unable to load your emergency request details right now.';
}
