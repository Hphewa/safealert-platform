import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { getCachedResponderRequest, updateCachedResponderRequest } from '../requestDetailsCache';
import { displayValue, parseResponderAssignmentView, responderRequestReturnTab } from '../requestDetails';
import { replaceResponderRequestCache } from '../requestDetailsCache';
import { getResponderRequestById, listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { acceptResponderRequest, declineResponderRequest } from '../api/responderDecisionApi';
import { useResponderOffline } from '../offline/useResponderOffline';
import { ResponderOfflineStatus } from '../offline/ResponderOfflineStatus';
import { OfflineUpdateError, projectQueuedUpdates } from '../offline/responderUpdateQueue';
import {
  canRecordFieldUpdate,
  formatUpdateTimestamp,
  validateCompletionFormFields,
  validateFieldNotes,
  type CompletionFieldErrors
} from '../fieldUpdateUi';
import {
  canManageResponderProgress,
  getResponderProgressAction,
  progressStatusLabel,
  responderProgressFeedback
} from '../progressUi';
import {
  canShowResponderDecisionActions,
  decisionButtonLabel,
  isResponderDecisionBusy,
  type ResponderDecisionAction
} from '../decisionUi';
import {
  extractEmergencyCoordinates,
  formatCoordinate,
  initiateResidentCall,
  initiateViewLocationRoute,
  isValidPhoneNumber
} from '../contactLocationUi';

export function ResponderRequestDetailsScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string | string[]; sourceTab?: string | string[]; sourceScreen?: string | string[] }>();
  const sourceScreen = parseResponderAssignmentView(params.sourceScreen);
  const backLabel = sourceScreen === 'history' ? 'Back to History'
    : sourceScreen === 'active' ? 'Back to Active Responses'
      : sourceScreen === 'map' ? 'Back to Map' : 'Back to Requests';
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const [updatedRequest, setUpdatedRequest] = useState<SafeResponseRequest | null>(null);

  const syncFeedbackHolder: { current?: (synced: SafeResponseRequest) => void } = {};

  // LDFEW-336: Refresh authoritative request data when background synchronization confirms updates
  const handleSyncSuccess = useCallback((syncedRequests: SafeResponseRequest[]) => {
    if (!requestId) return;
    const syncedThis = syncedRequests.find((r) => r.id === requestId);
    if (syncedThis) {
      setUpdatedRequest(syncedThis);
      updateCachedResponderRequest(syncedThis);
      syncFeedbackHolder.current?.(syncedThis);
    }
  }, [requestId]);

  const offline = useResponderOffline(user, `${accessToken ?? ''}:${requestId ?? ''}`, {
    accessToken,
    onSyncSuccess: handleSyncSuccess
  });

  const cached = requestId ? getCachedResponderRequest(requestId) : null;
  const safeCached =
    cached && requestId && (cached.status === 'NEW' || (user?.id && cached.assignedResponderId === user.id))
      ? cached
      : null;
  const safeUpdated =
    updatedRequest &&
    requestId &&
    updatedRequest.id === requestId &&
    (updatedRequest.status === 'NEW' || (user?.id && updatedRequest.assignedResponderId === user.id))
      ? updatedRequest
      : null;
  const confirmedRequest = safeUpdated ?? safeCached;
  // Local progress is an overlay, never written into the server-confirmed request cache.
  const projection = confirmedRequest ? projectQueuedUpdates(confirmedRequest, offline.items) : null;
  const responseRequest = projection?.request ?? null;
  const hasPendingUpdates = offline.items.some((item) => item.requestId === requestId);
  const offlineSaveBlocked = offline.status !== 'ready' || Boolean(projection?.conflict);
  const [decisionAction, setDecisionAction] = useState<ResponderDecisionAction>('idle');
  // Synchronous ref gate prevents rapid multiple button presses from firing duplicate
  // concurrent network requests for accept or decline before React commits the busy state.
  const decisionInFlightRef = useRef(false);
  const progressInFlightRef = useRef(false);
  const [progressFeedback, setProgressFeedback] = useState<{
    requestId: string;
    kind: 'updating' | 'success' | 'error';
    message: string;
  } | null>(null);
  const currentFeedback = progressFeedback?.requestId === requestId ? progressFeedback : null;
  const isUpdatingProgress = progressFeedback?.kind === 'updating';
  const progressAction = getResponderProgressAction(responseRequest, user);

  // LDFEW-266 / LDFEW-351: Operational field notes state and duplicate-submit prevention.
  // Retain uncommitted user input across re-renders in a local draft so typed notes are
  // never wiped out if an API call fails or if the user navigates within the screen.
  const [fieldNotesDraft, setFieldNotesDraft] = useState<{ id: string; value: string } | null>(null);
  const fieldNotesInput = fieldNotesDraft && responseRequest && fieldNotesDraft.id === responseRequest.id
    ? fieldNotesDraft.value
    : (responseRequest?.fieldNotes ?? '');
  const setFieldNotesInput = (value: string) => {
    setFieldNotesDraft({ id: responseRequest?.id ?? '', value });
    if (fieldUpdateFeedback?.kind === 'error') {
      setFieldUpdateFeedback(null);
    }
  };

  // Synchronous ref gate prevents rapid multiple button presses from firing duplicate
  // concurrent network requests before React has committed the disabled button state.
  const fieldUpdateInFlightRef = useRef(false);
  const [fieldUpdateFeedback, setFieldUpdateFeedback] = useState<{
    requestId: string;
    kind: 'saving' | 'success' | 'error';
    message: string;
  } | null>(null);
  const currentFieldFeedback = fieldUpdateFeedback?.requestId === requestId ? fieldUpdateFeedback : null;
  const isSavingFieldUpdate = fieldUpdateFeedback?.kind === 'saving';
  const progressDisabled = isUpdatingProgress || isSavingFieldUpdate || !accessToken?.trim() || offlineSaveBlocked;

  // LDFEW-266 / LDFEW-352: Completion details form inputs and draft state.
  // Drafts preserve uncommitted text in local state during re-renders, network errors,
  // or user corrections, preventing field loss before backend persistence.
  const [assistanceDraft, setAssistanceDraft] = useState<{ id: string; value: string } | null>(null);
  const assistanceProvidedInput = assistanceDraft && responseRequest && assistanceDraft.id === responseRequest.id
    ? assistanceDraft.value
    : (responseRequest?.assistanceProvided ?? '');
  const setAssistanceProvidedInput = (value: string) => {
    setAssistanceDraft({ id: responseRequest?.id ?? '', value });
    if (completionFieldErrors.assistanceProvided) {
      setCompletionFieldErrors((prev) => ({ ...prev, assistanceProvided: undefined }));
    }
    if (progressFeedback?.kind === 'error') {
      setProgressFeedback(null);
    }
  };

  const [summaryDraft, setSummaryDraft] = useState<{ id: string; value: string } | null>(null);
  const completionSummaryInput = summaryDraft && responseRequest && summaryDraft.id === responseRequest.id
    ? summaryDraft.value
    : (responseRequest?.completionSummary ?? '');
  const setCompletionSummaryInput = (value: string) => {
    setSummaryDraft({ id: responseRequest?.id ?? '', value });
    if (completionFieldErrors.completionSummary) {
      setCompletionFieldErrors((prev) => ({ ...prev, completionSummary: undefined }));
    }
    if (progressFeedback?.kind === 'error') {
      setProgressFeedback(null);
    }
  };

  const [remarksDraft, setRemarksDraft] = useState<{ id: string; value: string } | null>(null);
  const responderRemarksInput = remarksDraft && responseRequest && remarksDraft.id === responseRequest.id
    ? remarksDraft.value
    : (responseRequest?.responderRemarks ?? '');
  const setResponderRemarksInput = (value: string) => {
    setRemarksDraft({ id: responseRequest?.id ?? '', value });
    if (completionFieldErrors.responderRemarks) {
      setCompletionFieldErrors((prev) => ({ ...prev, responderRemarks: undefined }));
    }
    if (progressFeedback?.kind === 'error') {
      setProgressFeedback(null);
    }
  };

  // Inline field-level validation errors displayed directly under each input field
  const [completionFieldErrors, setCompletionFieldErrors] = useState<CompletionFieldErrors>({});

  // LDFEW-266 / LDFEW-355: Revalidate request data from backend to display previously saved updates
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const externalActionInFlight = useRef(false);
  const [externalAction, setExternalAction] = useState<'call' | 'location' | null>(null);
  const externalActionContext = useRef({ requestId, accessToken, request: responseRequest, connectivity: offline.connectivity });
  externalActionContext.current = { requestId, accessToken, request: responseRequest, connectivity: offline.connectivity };

  // Synchronize local feedback and drafts with confirmed backend request after sync,
  // replacing stale "Saved offline" messages with confirmed status and clearing completion drafts.
  syncFeedbackHolder.current = (synced: SafeResponseRequest) => {
    setProgressFeedback((prev) => {
      if (prev?.kind === 'success' && prev.message.includes('Saved offline')) {
        return {
          requestId: synced.id,
          kind: 'success',
          message: `Progress synchronized: ${progressStatusLabel(synced.status)}.`
        };
      }
      return prev;
    });
    setFieldUpdateFeedback((prev) => {
      if (prev?.kind === 'success' && prev.message.includes('Saved offline')) {
        return {
          requestId: synced.id,
          kind: 'success',
          message: 'Field update synchronized with server.'
        };
      }
      return prev;
    });
    if (synced.fieldNotes) {
      setFieldNotesDraft({ id: synced.id, value: synced.fieldNotes });
    }
    if (synced.status === 'COMPLETED') {
      setAssistanceDraft(null);
      setSummaryDraft(null);
      setRemarksDraft(null);
    }
  };

  const refreshRequest = useCallback(async () => {
    if (!requestId || !accessToken?.trim()) {
      return;
    }
    // Read connectivity at the time of refresh. A connectivity event alone must
    // not refetch details and erase an unsaved completion/field-note draft.
    if (externalActionContext.current.connectivity === 'offline') {
      setRefreshError(externalActionContext.current.request
        ? 'You are offline. Showing previously loaded request details.'
        : 'You are offline. Connect to load this request. Saved updates remain on this device.');
      return;
    }

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const fresh = typeof getResponderRequestById === 'function'
        ? await getResponderRequestById(requestId, accessToken)
        : null;
      if (!offline.isCurrent()) return;

      if (fresh) {
        updateCachedResponderRequest(fresh);
        setUpdatedRequest(fresh);
        if (!fieldUpdateInFlightRef.current) {
          setFieldNotesDraft(null);
        }
        if (!progressInFlightRef.current) {
          setAssistanceDraft(null);
          setSummaryDraft(null);
          setRemarksDraft(null);
        }
      }
    } catch (error) {
      if (!offline.isCurrent()) return;
      if (error instanceof ApiClientError && (error.status === 403 || error.status === 404)) {
        setUpdatedRequest(null);
        setRefreshError(
          error.status === 403
            ? 'You are not authorized to view this emergency request.'
            : 'This emergency request could not be found.'
        );
      } else {
        setRefreshError('Unable to refresh request details. Please check your connection and try again.');
      }
    } finally {
      if (offline.isCurrent()) setIsRefreshing(false);
    }
  }, [requestId, accessToken]);

  useFocusEffect(
    useCallback(() => {
      void refreshRequest();
    }, [refreshRequest])
  );

  // Keep the existing online API path; persist eligible offline work before showing local success.
  const saveFieldUpdate = async () => {
    // Prevent repeated taps from sending duplicate field-update requests while
    // the current save operation is still in progress.
    if (
      fieldUpdateInFlightRef.current ||
      progressInFlightRef.current || offlineSaveBlocked ||
      !confirmedRequest || !canRecordFieldUpdate(responseRequest, user) ||
      !requestId ||
      requestId !== responseRequest?.id ||
      !accessToken?.trim()
    ) {
      return;
    }

    // Client-side validation: provide immediate user-friendly feedback near the field
    // and avoid triggering unnecessary network requests when input is invalid.
    const validationError = validateFieldNotes(fieldNotesInput);
    if (validationError) {
      setFieldUpdateFeedback({ requestId, kind: 'error', message: validationError });
      return;
    }

    // Lock submission gate before initiating async network dispatch
    fieldUpdateInFlightRef.current = true;
    setFieldUpdateFeedback({ requestId, kind: 'saving', message: 'Saving field update...' });

    try {
      // Only field notes enter the operation payload. Tokens are used for online calls,
      // while the local queue is isolated by the authenticated responder's identity.
      const result = await offline.saveUpdate({
        request: confirmedRequest, user, accessToken,
        update: { type: 'field-update', payload: { fieldNotes: fieldNotesInput.trim() } }
      });
      if (!offline.isCurrent()) return;
      if (result.saved === 'local') {
        setFieldUpdateFeedback({ requestId, kind: 'success', message: 'Saved offline – pending sync. This update is saved on this device only.' });
        return;
      }
      const updated = result.request;

      // Synchronize both detail cache and local screen state with the server-confirmed record
      updateCachedResponderRequest(updated);
      setUpdatedRequest(updated);
      // Synchronize draft value with the confirmed trimmed backend value
      setFieldNotesDraft({ id: updated.id, value: updated.fieldNotes ?? fieldNotesInput.trim() });

      setFieldUpdateFeedback({
        requestId,
        kind: 'success',
        message: 'Field update saved successfully.'
      });
    } catch (error) {
      // On failure, retain typed text in fieldNotesDraft so the responder can fix or retry
      // without losing valuable operational context entered in field conditions.
      if (!offline.isCurrent()) return;
      const message = error instanceof ApiClientError || error instanceof OfflineUpdateError
        ? error.message
        : 'Unable to save field update. Please check your connection and try again.';
      setFieldUpdateFeedback({ requestId, kind: 'error', message });
    } finally {
      // Release submission gate so retry or subsequent updates are possible
      fieldUpdateInFlightRef.current = false;
    }
  };

  const updateProgress = async () => {
    if (
      progressInFlightRef.current ||
      fieldUpdateInFlightRef.current || offlineSaveBlocked || !confirmedRequest ||
      !requestId ||
      requestId !== responseRequest?.id ||
      !progressAction ||
      !accessToken?.trim()
    ) {
      return;
    }

    // LDFEW-266 / LDFEW-352 / LDFEW-353: Validate required completion information before final completion.
    // When completing an IN_PROGRESS request, ensure that required details (assistance provided
    // and completion outcome) are present and conform to boundary rules.
    const hasCompletionActivity = Boolean(
      assistanceDraft !== null ||
      summaryDraft !== null ||
      remarksDraft !== null ||
      assistanceProvidedInput.trim() ||
      completionSummaryInput.trim() ||
      responderRemarksInput.trim()
    );

    if (progressAction.nextStatus === 'COMPLETED' && (hasCompletionActivity || offline.connectivity !== 'online' || hasPendingUpdates)) {
      const fieldErrors = validateCompletionFormFields({
        assistanceProvided: assistanceProvidedInput,
        completionSummary: completionSummaryInput,
        responderRemarks: responderRemarksInput
      });

      if (Object.keys(fieldErrors).length > 0) {
        setCompletionFieldErrors(fieldErrors);
        const firstError = fieldErrors.assistanceProvided || fieldErrors.completionSummary || fieldErrors.responderRemarks;
        setProgressFeedback({
          requestId,
          kind: 'error',
          message: firstError ?? 'Please complete all required fields.'
        });
        return;
      }
    }

    const completionDetails = progressAction.nextStatus === 'COMPLETED' && (assistanceProvidedInput.trim() || completionSummaryInput.trim() || responderRemarksInput.trim())
      ? {
          assistanceProvided: assistanceProvidedInput.trim(),
          completionSummary: completionSummaryInput.trim(),
          ...(responderRemarksInput.trim() ? { responderRemarks: responderRemarksInput.trim() } : {})
        }
      : undefined;

    // The ref blocks repeated taps before React can render the disabled state.
    progressInFlightRef.current = true;
    setProgressFeedback({ requestId, kind: 'updating', message: 'Updating progress...' });

    try {
      const result = await offline.saveUpdate({
        request: confirmedRequest, user, accessToken,
        update: { type: 'progress', payload: { status: progressAction.nextStatus, ...(completionDetails ? { completionDetails } : {}) } }
      });
      if (!offline.isCurrent()) return;
      if (result.saved === 'local') {
        setCompletionFieldErrors({});
        setProgressFeedback({ requestId, kind: 'success', message: 'Saved offline – pending sync. Progress is saved on this device only.' });
        return;
      }
      const updated = result.request;
      // Keep the backend-confirmed status for details and the dashboard's next focus.
      updateCachedResponderRequest(updated);
      setUpdatedRequest(updated);
      setCompletionFieldErrors({});
      setProgressFeedback({
        requestId,
        kind: 'success',
        message: `Progress updated: ${progressStatusLabel(updated.status)}.`
      });
    } catch (error) {
      if (!offline.isCurrent()) return;
      // If the backend indicates required completion details are missing or invalid,
      // highlight the inline form fields so the responder sees exactly which inputs need attention.
      if (
        error instanceof ApiClientError &&
        (error.code === 'COMPLETION_DETAILS_REQUIRED' || error.code === 'INVALID_COMPLETION_DETAILS')
      ) {
        setCompletionFieldErrors((prev) => ({
          assistanceProvided:
            prev.assistanceProvided ??
            (!assistanceProvidedInput.trim() ? 'Assistance provided is required.' : undefined),
          completionSummary:
            prev.completionSummary ??
            (!completionSummaryInput.trim() ? 'Completion summary is required.' : undefined),
          responderRemarks: prev.responderRemarks
        }));
      }
      setProgressFeedback({ requestId, kind: 'error', message: error instanceof OfflineUpdateError ? error.message : responderProgressFeedback(error) });
    } finally {
      progressInFlightRef.current = false;
    }
  };

  const returnToRequests = () => router.replace('/responder');
  const backToRequests = () => {
    if (sourceScreen) {
      router.dismissTo(`/responder/${sourceScreen}`);
      return;
    }
    const tab = responderRequestReturnTab(params.sourceTab, responseRequest?.status);
    if (tab === 'ASSIGNED') {
      // Return to the existing queue with Assigned selected so progress work stays in context.
      router.dismissTo({ pathname: '/responder', params: { tab } });
    } else {
      returnToRequests();
    }
  };

  const refreshResponderQueues = useCallback(async () => {
    if (!accessToken) {
      throw new Error('Your session has expired. Please log in again.');
    }

    const [pending, assigned] = await Promise.all([
      listPendingResponderRequests(accessToken),
      listAssignedResponderRequests(accessToken)
    ]);

    // Refresh both queues because Accept moves a request from Pending to
    // Assigned, while Decline removes it only from this responder's Pending queue.
    replaceResponderRequestCache([...pending, ...assigned]);
  }, [accessToken]);

  const friendlyDecisionError = (error: unknown) => {
    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        return 'Your session has expired. Please log in again.';
      }

      if (error.status === 409 || error.code === 'REQUEST_NOT_AVAILABLE') {
        return 'This request is no longer available.';
      }
    }

    return 'Unable to update this request. Please check your connection and try again.';
  };

  const showAcceptSuccess = () => {
    const message = 'Request accepted successfully.';

    if (Platform?.OS === 'web') {
      // Web alerts do not reliably invoke React Native action callbacks, so
      // navigate explicitly after showing the success feedback to avoid dead-end screens.
      globalThis.alert(message);
      returnToRequests();
      return;
    }

    Alert.alert('Request accepted', message, [
      { text: 'Back to Requests', onPress: returnToRequests }
    ]);
  };

  const acceptRequest = async () => {
    // Synchronous ref gate prevents rapid multiple button presses from firing duplicate
    // concurrent network requests before React has committed the busy/disabled state.
    if (
      decisionInFlightRef.current ||
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    decisionInFlightRef.current = true;
    setDecisionAction('accepting');

    try {
      await acceptResponderRequest(requestId, accessToken);
      await refreshResponderQueues();
      showAcceptSuccess();
    } catch (error) {
      Alert.alert('Unable to accept request', friendlyDecisionError(error));
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
        try {
          await refreshResponderQueues();
        } catch {
          // The original action error is more useful than a secondary refresh error.
        }
      }
    } finally {
      // Always release the submission gate and clear the busy state so failed requests cannot trap the UI.
      decisionInFlightRef.current = false;
      setDecisionAction('idle');
    }
  };

  const confirmDeclineRequest = () => {
    if (
      decisionInFlightRef.current ||
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    if (Platform?.OS === 'web') {
      // Browser confirmation is required on web because native Alert action
      // callbacks are not consistently available in React Native Web.
      if (globalThis.confirm('Decline this emergency request?')) {
        void declineRequest();
      }
      return;
    }

    Alert.alert('Decline this emergency request?', 'The request will remain available to other responders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void declineRequest() }
    ]);
  };

  const showDeclineSuccess = () => {
    const message = 'Request declined. It remains available to other responders.';

    if (Platform?.OS === 'web') {
      // Web alerts do not reliably invoke React Native action callbacks, so
      // navigate explicitly after showing the success feedback.
      globalThis.alert(message);
      returnToRequests();
      return;
    }

    Alert.alert('Request declined', message, [
      { text: 'Back to Requests', onPress: returnToRequests }
    ]);
  };

  const declineRequest = async () => {
    // Synchronous ref gate prevents repeated taps from dispatching concurrent decline mutations.
    if (
      decisionInFlightRef.current ||
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    decisionInFlightRef.current = true;
    setDecisionAction('declining');

    try {
      await declineResponderRequest(requestId, accessToken);
      await refreshResponderQueues();
      showDeclineSuccess();
    } catch (error) {
      Alert.alert('Unable to decline request', friendlyDecisionError(error));
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
        try {
          await refreshResponderQueues();
        } catch {
          // The original action error is more useful than a secondary refresh error.
        }
      }
    } finally {
      decisionInFlightRef.current = false;
      setDecisionAction('idle');
    }
  };

  if (!responseRequest) {
    if (isRefreshing) {
      return (
        <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
          <DetailsHeader backLabel={backLabel} isRefreshing={true} onBack={backToRequests} />
          <View style={styles.noticeCard}>
            <ResponderOfflineStatus {...offline} />
            <ActivityIndicator color={dashboardTheme.colors.primaryStrong} size="large" />
            <Text style={styles.noticeTitle}>Loading request details...</Text>
            <Text style={styles.noticeBody}>Fetching the latest updates from the server.</Text>
          </View>
        </DashboardScreen>
      );
    }

    const isAccessRestricted = refreshError === 'You are not authorized to view this emergency request.';
    const isNetworkError = Boolean(
      refreshError &&
      !isAccessRestricted &&
      refreshError !== 'This emergency request could not be found.'
    );

    return (
      <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
        <DetailsHeader backLabel={backLabel} onBack={backToRequests} onRefresh={() => void refreshRequest()} />
        <View style={styles.noticeCard}>
          <ResponderOfflineStatus {...offline} />
          <View style={styles.noticeIconWrap}>
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={22} />
          </View>
          <Text style={styles.noticeTitle}>
            {isAccessRestricted ? 'Access Restricted' : 'Request not available'}
          </Text>
          <Text style={styles.noticeBody}>
            {refreshError ?? 'This emergency request could not be found.'}
          </Text>
          {isNetworkError ? <RetryDetailsButton onPress={() => void refreshRequest()} /> : null}
          <BackToRequestsButton label={backLabel} onPress={backToRequests} />
        </View>
      </DashboardScreen>
    );
  }

  // LDFEW-267 / LDFEW-363: Extract and validate emergency GPS coordinates from the selected request
  // so the responder can inspect exact coordinates and plan response actions safely.
  const emergencyCoordinates = extractEmergencyCoordinates(responseRequest.location);
  const canViewLocation = emergencyCoordinates.isValid;

  // LDFEW-267 / LDFEW-362: Validate resident phone number before enabling call action.
  // Prevents invalid external dialer invocation when phone data is missing or malformed.
  const canCallResident = isValidPhoneNumber(responseRequest.contact?.phoneNumber);

  const openContactAction = async (action: 'call' | 'location') => {
    // A ref closes the gap before React disables the buttons after the first tap.
    if (externalActionInFlight.current) return;
    const context = externalActionContext.current;
    if (context.requestId !== requestId || context.accessToken !== accessToken) return;
    const current = context.request;
    const coordinates = extractEmergencyCoordinates(current?.location);
    const phone = current?.contact?.phoneNumber;
    if (!current || current.id !== requestId
      || (action === 'call' ? !isValidPhoneNumber(phone) : !coordinates.isValid)) {
      showContactActionFeedback(
        action === 'call' ? 'Phone number unavailable' : 'Emergency location unavailable',
        'Refresh the request details and try again.'
      );
      return;
    }
    externalActionInFlight.current = true;
    setExternalAction(action);
    const isCurrentRequest = () => externalActionContext.current.requestId === requestId
      && externalActionContext.current.accessToken === accessToken;
    try {
      const opened = action === 'call'
        ? await initiateResidentCall(phone)
        : await initiateViewLocationRoute(coordinates.latitude, coordinates.longitude);
      if (!opened && isCurrentRequest()) {
        showContactActionFeedback(
          action === 'call' ? 'Unable to make call' : 'Unable to open location',
          action === 'call' ? 'The phone application could not be opened. Please try again.'
            : 'The map or browser could not be opened. Please try again.'
        );
      }
    } catch {
      if (isCurrentRequest()) showContactActionFeedback('Something went wrong', 'Please try again.');
    } finally {
      externalActionInFlight.current = false;
      setExternalAction(null);
    }
  };

  const handleCallResidentPress = () => { void openContactAction('call'); };
  const handleViewLocationPress = () => { void openContactAction('location'); };

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
      <DetailsHeader backLabel={backLabel} errorMessage={refreshError} isRefreshing={isRefreshing} onBack={backToRequests} onRefresh={() => void refreshRequest()} />

      <View style={styles.heroCard}>
        <ResponderOfflineStatus {...offline} />
        {projection?.conflict ? <Text accessibilityRole="alert" style={styles.progressError}>This request has changed on the server. Pending updates need review before more updates can be saved.</Text> : null}
        <View style={styles.heroBadgeRow}>
          <StatusBadge label={responseRequest.status} tone={statusTone(responseRequest.status)} />
        </View>
        <Text style={styles.heroTitle}>{formatAssistanceType(responseRequest.assistanceType)}</Text>
        <Text style={styles.heroSubtitle}>Request ID: {displayValue(responseRequest.id)}</Text>
      </View>

      {canManageResponderProgress(responseRequest, user) ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>RESPONSE PROGRESS</Text>
          <Text style={styles.detailValue}>{`${hasPendingUpdates ? 'Local progress (pending sync)' : 'Current status'}: ${progressStatusLabel(responseRequest.status)}`}</Text>
          {responseRequest.status === 'COMPLETED' ? (
            <View style={styles.completedSummaryCard}>
              <Text accessibilityLiveRegion="polite" style={styles.progressSuccess}>
                {hasPendingUpdates ? 'Completion saved on this device – pending sync' : '\u2713 Emergency response completed'}
              </Text>
              <View style={styles.completionDetailsBlock}>
                <Text style={styles.completionSectionHeading}>COMPLETION DETAILS</Text>
                <DetailRow label="Completed at" value={hasPendingUpdates ? 'Awaiting synchronization' : formatUpdateTimestamp(responseRequest.completedAt)} />
                <DetailRow label="Assistance provided" value={displayValue(responseRequest.assistanceProvided)} />
                <DetailRow label="Completion summary" value={displayValue(responseRequest.completionSummary)} />
                {responseRequest.responderRemarks ? (
                  <DetailRow label="Responder remarks" value={displayValue(responseRequest.responderRemarks)} />
                ) : null}
              </View>
            </View>
          ) : progressAction ? (
            <Pressable
              accessibilityLabel={progressAction.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: progressDisabled, busy: isUpdatingProgress }}
              disabled={progressDisabled}
              onPress={updateProgress}
              style={({ pressed }) => [
                styles.backButton,
                progressDisabled && styles.disabledButton,
                pressed && !progressDisabled && styles.pressed
              ]}
            >
              {isUpdatingProgress ? <ActivityIndicator color="#ffffff" /> : null}
              <Text style={styles.backButtonText}>
                {isUpdatingProgress ? 'Updating progress...' : progressAction.label}
              </Text>
            </Pressable>
          ) : null}
          {hasPendingUpdates && confirmedRequest ? <Text style={styles.decisionHelper}>{`Last confirmed server status: ${progressStatusLabel(confirmedRequest.status)}`}</Text> : null}
          {!accessToken?.trim() && responseRequest.status !== 'COMPLETED' ? (
            <Text style={styles.progressError}>Please log in again to update this request.</Text>
          ) : null}
          {currentFeedback && currentFeedback.kind !== 'updating' ? (
            <Text
              accessibilityRole={currentFeedback.kind === 'error' ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={currentFeedback.kind === 'error' ? styles.progressError : styles.progressSuccess}
            >
              {currentFeedback.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* LDFEW-352: Completion details form rendered when request is IN_PROGRESS */}
      {canManageResponderProgress(responseRequest, user) && responseRequest.status === 'IN_PROGRESS' ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>RECORD COMPLETION DETAILS</Text>
          <Text style={styles.decisionHelper}>
            Document the assistance provided and resolution outcome before completing this request.
          </Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Assistance Provided *</Text>
            <TextInput
              accessibilityLabel="Assistance Provided"
              accessibilityHint="Enter description of assistance provided to residents"
              editable={!isUpdatingProgress}
              maxLength={1000}
              multiline
              numberOfLines={3}
              onChangeText={setAssistanceProvidedInput}
              placeholder="e.g., Relocated resident to shelter and provided first aid"
              placeholderTextColor={dashboardTheme.colors.muted}
              style={[
                styles.textAreaInput,
                completionFieldErrors.assistanceProvided ? styles.inputErrorBorder : null
              ]}
              value={assistanceProvidedInput}
            />
            <View style={styles.inputFooterRow}>
              {completionFieldErrors.assistanceProvided ? (
                <Text accessibilityRole="alert" style={styles.fieldErrorText}>
                  {completionFieldErrors.assistanceProvided}
                </Text>
              ) : <View />}
              <Text style={styles.charCount}>{assistanceProvidedInput.length} / 1000</Text>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Completion Summary *</Text>
            <TextInput
              accessibilityLabel="Completion Summary"
              accessibilityHint="Enter overall outcome and resolution summary"
              editable={!isUpdatingProgress}
              maxLength={1000}
              multiline
              numberOfLines={3}
              onChangeText={setCompletionSummaryInput}
              placeholder="e.g., Immediate threat resolved; resident safe and stable"
              placeholderTextColor={dashboardTheme.colors.muted}
              style={[
                styles.textAreaInput,
                completionFieldErrors.completionSummary ? styles.inputErrorBorder : null
              ]}
              value={completionSummaryInput}
            />
            <View style={styles.inputFooterRow}>
              {completionFieldErrors.completionSummary ? (
                <Text accessibilityRole="alert" style={styles.fieldErrorText}>
                  {completionFieldErrors.completionSummary}
                </Text>
              ) : <View />}
              <Text style={styles.charCount}>{completionSummaryInput.length} / 1000</Text>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Responder Remarks (Optional)</Text>
            <TextInput
              accessibilityLabel="Responder Remarks"
              accessibilityHint="Enter any internal remarks or notes"
              editable={!isUpdatingProgress}
              maxLength={1000}
              multiline
              numberOfLines={2}
              onChangeText={setResponderRemarksInput}
              placeholder="Optional operational or handover remarks..."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={[
                styles.textAreaInput,
                completionFieldErrors.responderRemarks ? styles.inputErrorBorder : null
              ]}
              value={responderRemarksInput}
            />
            <View style={styles.inputFooterRow}>
              {completionFieldErrors.responderRemarks ? (
                <Text accessibilityRole="alert" style={styles.fieldErrorText}>
                  {completionFieldErrors.responderRemarks}
                </Text>
              ) : <View />}
              <Text style={styles.charCount}>{responderRemarksInput.length} / 1000</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* LDFEW-351: Field Update section for assigned responder */}
      {canRecordFieldUpdate(responseRequest, user) ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>FIELD UPDATE</Text>
          <Text style={styles.decisionHelper}>
            Record on-site observations, status updates, or coordination notes during active response.
          </Text>

          {/* LDFEW-355: Display previously saved responder update if present */}
          {responseRequest.fieldNotes ? (
            <View style={styles.savedNoteBox}>
              <View style={styles.savedNoteHeader}>
                <Text style={styles.savedNoteLabel}>{hasPendingUpdates ? 'LOCAL UPDATE – PENDING SYNC' : 'PREVIOUSLY SAVED UPDATE'}</Text>
                <Text style={styles.savedNoteTimestamp}>
                  {hasPendingUpdates ? 'Saved on this device' : formatUpdateTimestamp(responseRequest.fieldUpdatedAt)}
                </Text>
              </View>
              <Text style={styles.savedNoteText}>{responseRequest.fieldNotes}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {responseRequest.fieldNotes ? 'Update Field Notes' : 'Field Notes *'}
            </Text>
            <TextInput
              accessibilityLabel="Field Update Notes"
              accessibilityHint="Enter operational notes or field updates"
              editable={!isSavingFieldUpdate}
              maxLength={2000}
              multiline
              numberOfLines={4}
              onChangeText={setFieldNotesInput}
              placeholder="Record operational observations, hazards encountered, or supply updates..."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={[
                styles.textAreaInput,
                currentFieldFeedback?.kind === 'error' ? styles.inputErrorBorder : null
              ]}
              value={fieldNotesInput}
            />
            <Text style={styles.charCount}>{fieldNotesInput.length} / 2000</Text>
          </View>

          <Pressable
            accessibilityLabel="Save Field Update"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSavingFieldUpdate || isUpdatingProgress || offlineSaveBlocked || !accessToken?.trim(), busy: isSavingFieldUpdate }}
            disabled={isSavingFieldUpdate || isUpdatingProgress || offlineSaveBlocked || !accessToken?.trim()}
            onPress={saveFieldUpdate}
            style={({ pressed }) => [
              styles.secondaryActionButton,
              (isSavingFieldUpdate || isUpdatingProgress || offlineSaveBlocked || !accessToken?.trim()) && styles.disabledButton,
              pressed && !isSavingFieldUpdate && styles.pressed
            ]}
          >
            {isSavingFieldUpdate ? <ActivityIndicator color={dashboardTheme.colors.primaryStrong} /> : null}
            <Text style={styles.secondaryActionButtonText}>
              {isSavingFieldUpdate ? 'Saving update...' : 'Save Field Update'}
            </Text>
          </Pressable>

          {!accessToken?.trim() ? (
            <Text style={styles.progressError}>Please log in again to update this request.</Text>
          ) : null}

          {currentFieldFeedback && currentFieldFeedback.kind !== 'saving' ? (
            <Text
              accessibilityRole={currentFieldFeedback.kind === 'error' ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={currentFieldFeedback.kind === 'error' ? styles.progressError : styles.progressSuccess}
            >
              {currentFieldFeedback.message}
            </Text>
          ) : null}
        </View>
      ) : responseRequest.status === 'COMPLETED' && responseRequest.fieldNotes ? (
        <DetailsSection title="SAVED FIELD NOTES">
          <DetailRow label="Last updated" value={formatUpdateTimestamp(responseRequest.fieldUpdatedAt)} />
          <Text style={styles.description}>{responseRequest.fieldNotes}</Text>
        </DetailsSection>
      ) : null}

      {/* LDFEW-267 / LDFEW-363: Clearly display emergency GPS / location information */}
      <DetailsSection title="EMERGENCY LOCATION">
        <DetailRow label="Latitude" value={formatCoordinate(emergencyCoordinates.latitude)} />
        <DetailRow label="Longitude" value={formatCoordinate(emergencyCoordinates.longitude)} />
        {!canViewLocation ? <Text style={styles.description}>Emergency location unavailable</Text> : null}
        <Pressable
          accessibilityLabel="View Location / Route"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canViewLocation || externalAction !== null, busy: externalAction === 'location' }}
          disabled={!canViewLocation || externalAction !== null}
          onPress={handleViewLocationPress}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            (!canViewLocation || externalAction !== null) && styles.disabledButton,
            pressed && canViewLocation && styles.pressed
          ]}
        >
          <Text style={styles.secondaryActionButtonText}>View Location / Route</Text>
        </Pressable>
      </DetailsSection>

      <DetailsSection title="PEOPLE">
        <DetailRow label="People needing help" value={displayValue(responseRequest.affectedPeople)} />
        <DetailRow label="Number injured" value={displayValue(responseRequest.injuredPeople)} />
      </DetailsSection>

      <DetailsSection title="SPECIAL NEEDS">
        <DetailRow label="Vulnerable people" value={formatVulnerablePeople(responseRequest)} />
        <DetailRow label="Medical needs" value={responseRequest.medicalNeeds ? 'Yes' : 'No'} />
      </DetailsSection>

      <DetailsSection title="ACCESS">
        <DetailRow label="Road accessibility" value={displayValue(responseRequest.roadAccessibility)} />
      </DetailsSection>

      <DetailsSection title="DESCRIPTION">
        <Text style={styles.description}>{displayValue(responseRequest.description)}</Text>
      </DetailsSection>

      {/* LDFEW-267 / LDFEW-360: Clearly display resident contact information */}
      <DetailsSection title="RESIDENT CONTACT">
        <DetailRow label="Resident name" value={responseRequest.contact?.name} />
        <DetailRow label="Phone" value={canCallResident ? responseRequest.contact?.phoneNumber : 'Phone number unavailable'} />
        {responseRequest.contact?.email ? (
          <DetailRow label="Email" value={responseRequest.contact.email} />
        ) : null}
        {/* LDFEW-267 / LDFEW-362: Call Resident action using native device dialer */}
        <Pressable
          accessibilityLabel="Call Resident"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCallResident || externalAction !== null, busy: externalAction === 'call' }}
          disabled={!canCallResident || externalAction !== null}
          onPress={handleCallResidentPress}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            (!canCallResident || externalAction !== null) && styles.disabledButton,
            pressed && canCallResident && styles.pressed
          ]}
        >
          <Text style={styles.secondaryActionButtonText}>Call Resident</Text>
        </Pressable>
      </DetailsSection>

      <DetailsSection title="SUBMITTED">
        <DetailRow label="Date / time" value={formatSubmittedAt(responseRequest.createdAt)} />
      </DetailsSection>

      {canShowResponderDecisionActions(responseRequest) ? (
        <ResponderDecisionActions
          action={decisionAction}
          onAccept={() => void acceptRequest()}
          onDecline={confirmDeclineRequest}
        />
      ) : null}

      <BackToRequestsButton label={backLabel} onPress={backToRequests} />
    </DashboardScreen>
  );
}

function showContactActionFeedback(title: string, message: string) {
  // React Native Alert has no browser implementation; reuse the screen's web alert pattern.
  if (Platform.OS === 'web') globalThis.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}

function ResponderDecisionActions({
  action,
  onAccept,
  onDecline
}: {
  action: ResponderDecisionAction;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isBusy = isResponderDecisionBusy(action);

  return (
    <View style={styles.decisionSection}>
      <Text style={styles.decisionHeading}>RESPONDER DECISION</Text>
      <Text style={styles.decisionHelper}>Choose how you want to handle this new request.</Text>
      <View style={styles.decisionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: action === 'declining' }}
          disabled={isBusy}
          onPress={onDecline}
          style={({ pressed }) => [
            styles.declineButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && styles.pressed
          ]}
        >
          {action === 'declining' ? (
            <ActivityIndicator color={dashboardTheme.colors.critical} size="small" />
          ) : null}
          <Text style={styles.declineButtonText}>{decisionButtonLabel(action, 'decline')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: action === 'accepting' }}
          disabled={isBusy}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.acceptButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && styles.pressed
          ]}
        >
          {action === 'accepting' ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : null}
          <Text style={styles.acceptButtonText}>{decisionButtonLabel(action, 'accept')}</Text>
        </Pressable>
      </View>
      {isBusy ? (
        <Text style={styles.decisionHelper}>Processing your decision...</Text>
      ) : null}
    </View>
  );
}

function DetailsHeader({
  backLabel = 'Back to Requests',
  onBack,
  onRefresh,
  isRefreshing,
  errorMessage
}: {
  backLabel?: string;
  onBack: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  errorMessage?: string | null;
}) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel={backLabel === 'Back to Requests' ? 'Back to requests' : backLabel}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Emergency Response</Text>
          <Text style={styles.headerTitle}>Emergency Request</Text>
        </View>
        {onRefresh ? (
          <Pressable
            accessibilityLabel="Refresh request details"
            accessibilityRole="button"
            accessibilityState={{ disabled: isRefreshing, busy: isRefreshing }}
            disabled={isRefreshing}
            onPress={onRefresh}
            style={({ pressed }) => [styles.iconButton, pressed && !isRefreshing && styles.pressed]}
          >
            {isRefreshing ? (
              <ActivityIndicator color={dashboardTheme.colors.primaryStrong} size="small" />
            ) : (
              <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={20} />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {errorMessage ? (
        <Text accessibilityRole="alert" style={styles.progressError}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

function DetailsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{displayValue(value)}</Text>
    </View>
  );
}

function RetryDetailsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Retry loading request"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.retryNoticeButton, pressed && styles.pressed]}
    >
      <Text style={styles.retryNoticeButtonText}>Retry</Text>
    </Pressable>
  );
}

function BackToRequestsButton({ onPress, label = 'Back to Requests' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatAssistanceType(assistanceType: SafeResponseRequest['assistanceType']) {
  return assistanceType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatVulnerablePeople(responseRequest: SafeResponseRequest) {
  const vulnerablePeople = responseRequest.vulnerablePeople;

  if (!vulnerablePeople) {
    return 'Not provided';
  }

  const entries = [
    ['Children', vulnerablePeople.children],
    ['Elderly people', vulnerablePeople.elderlyPeople],
    ['Persons with disabilities', vulnerablePeople.personsWithDisabilities],
    ['Pregnant persons', vulnerablePeople.pregnantPersons]
  ].filter(([, count]) => typeof count === 'number' && count > 0);

  return entries.length
    ? entries.map(([label, count]) => `${label}: ${count}`).join(', ')
    : 'None reported';
}

function formatSubmittedAt(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function statusTone(status: SafeResponseRequest['status']) {
  return status === 'ASSIGNED' || status === 'COMPLETED' ? 'success' : 'info';
}

const styles = StyleSheet.create({
  progressSuccess: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.success
  },
  progressError: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.critical
  },
  decisionSection: {
      gap: 10,
      padding: 16,
      borderWidth: 1,
      borderColor: dashboardTheme.colors.border,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.surface,
      ...cardShadow
    },
  decisionHeading: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1,
      color: dashboardTheme.colors.info
    },
  decisionHelper: {
      fontSize: 14,
      lineHeight: 20,
      color: dashboardTheme.colors.muted
    },
  decisionRow: {
      flexDirection: 'row',
      gap: 10
    },
  declineButton: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: dashboardTheme.colors.critical,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.surface
    },
  declineButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: dashboardTheme.colors.critical,
      textAlign: 'center'
    },
  acceptButton: {
      flex: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.primaryStrong
    },
  acceptButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#ffffff',
      textAlign: 'center'
    },
  disabledButton: {
    opacity: 0.55
  },
  content: {
    paddingBottom: 28
  },
  headerContainer: {
    gap: 8
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  heroCard: {
    gap: 10,
    padding: 20,
    borderRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.primaryStrong,
    ...cardShadow
  },
  heroBadgeRow: {
    flexDirection: 'row'
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff'
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#dbeafe'
  },
  sectionCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  sectionBody: {
    gap: 12
  },
  detailRow: {
    gap: 4
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 16,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: dashboardTheme.colors.text
  },
  noticeCard: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  noticeIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text,
    textAlign: 'center'
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted,
    textAlign: 'center'
  },
  backButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primaryStrong
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  retryNoticeButton: {
    minHeight: 44,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1.5,
    borderColor: dashboardTheme.colors.primaryStrong
  },
  retryNoticeButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  pressed: {
    opacity: 0.8
  },
  // LDFEW-266: Styles for field updates and completion details
  textAreaInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.text,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top'
  },
  inputGroup: {
    gap: 4
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  charCount: {
    fontSize: 12,
    color: dashboardTheme.colors.muted,
    textAlign: 'right'
  },
  inputErrorBorder: {
    borderColor: dashboardTheme.colors.critical
  },
  fieldErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: dashboardTheme.colors.critical
  },
  inputFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  savedNoteBox: {
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: dashboardTheme.radius.md,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    gap: 6
  },
  savedNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4
  },
  savedNoteLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: dashboardTheme.colors.info
  },
  savedNoteTimestamp: {
    fontSize: 12,
    color: dashboardTheme.colors.muted
  },
  savedNoteText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
  },
  secondaryActionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1.5,
    borderColor: dashboardTheme.colors.primaryStrong,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  completionFormCard: {
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4
  },
  completionFormHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  completionFormHelper: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  completedSummaryCard: {
    gap: 12
  },
  completionDetailsBlock: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: dashboardTheme.colors.border
  },
  completionSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info,
    marginBottom: 4
  }
});
