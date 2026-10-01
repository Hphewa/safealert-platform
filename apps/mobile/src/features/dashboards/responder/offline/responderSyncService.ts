import {
  RESPONSE_STATUSES,
  isValidResponseProgressTransition,
  type ResponseStatus,
  type SafeResponseRequest
} from '@safealert/contracts';
import { ApiClientError } from '../../../../services/api/client';
import { validateCompletionDetails, validateFieldNotes } from '../fieldUpdateUi';
import type { ResponderCompletionDetails, ResponderProgressStatus } from '../api/responderProgressApi';
import type { Connectivity } from './connectivity';
import type { QueuedResponderUpdate, ResponderUpdateQueue } from './responderUpdateQueue';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'paused';

export type SyncState = {
  status: SyncStatus;
  isSyncing: boolean;
  syncedCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
};

export type SyncResult = {
  success: boolean;
  syncedRequests: SafeResponseRequest[];
  syncedCount: number;
  remainingCount: number;
  error?: string | null;
};

export type ResponderSyncApi = {
  updateResponderRequestProgress: (
    requestId: string,
    status: ResponderProgressStatus,
    accessToken: string,
    completionDetails?: ResponderCompletionDetails
  ) => Promise<SafeResponseRequest>;
  saveResponderFieldUpdate: (
    requestId: string,
    fieldNotes: string,
    accessToken: string
  ) => Promise<SafeResponseRequest>;
  getResponderRequestById: (
    requestId: string,
    accessToken: string
  ) => Promise<SafeResponseRequest | null>;
};

export type ResponderSyncCache = {
  updateCachedResponderRequest: (request: SafeResponseRequest) => void;
};

export type SyncOptions = {
  onSyncSuccess?: (syncedRequests: SafeResponseRequest[]) => void | Promise<void>;
};

const initialSyncState: SyncState = {
  status: 'idle',
  isSyncing: false,
  syncedCount: 0,
  lastError: null,
  lastSyncedAt: null
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStatus = (value: unknown): value is ResponseStatus =>
  RESPONSE_STATUSES.some((status) => status === value);

// Validate queue entries before processing to prevent malformed or tampered local data
// from causing runtime exceptions or sending illegal payloads to the backend API.
export function validateQueueItemForProcessing(
  item: unknown,
  expectedOwner: string
): { isValid: true; validatedItem: QueuedResponderUpdate } | { isValid: false; error: string } {
  if (!isRecord(item)) {
    return { isValid: false, error: 'Queue entry must be a valid object.' };
  }

  // Validate stable local ID
  if (typeof item.localId !== 'string' || !/^[a-z\d-]{1,100}$/i.test(item.localId)) {
    return { isValid: false, error: 'Queue entry contains an invalid local identifier.' };
  }

  // Validate responder ownership matches the authenticated user session
  if (typeof item.responderId !== 'string' || item.responderId !== expectedOwner) {
    return { isValid: false, error: 'Queue entry does not belong to the current authenticated responder.' };
  }

  // Validate MongoDB ObjectId format for request ID
  if (typeof item.requestId !== 'string' || !/^[a-f\d]{24}$/i.test(item.requestId)) {
    return { isValid: false, error: 'Queue entry references an invalid emergency request ID.' };
  }

  // Validate expected status against supported contract response statuses
  if (!isStatus(item.expectedStatus)) {
    return { isValid: false, error: 'Queue entry references an unrecognized emergency response status.' };
  }

  // Validate timestamp metadata
  if (typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))) {
    return { isValid: false, error: 'Queue entry contains an invalid creation timestamp.' };
  }

  // Validate strictly positive integer sequence for FIFO order tracking
  if (typeof item.sequence !== 'number' || !Number.isSafeInteger(item.sequence) || item.sequence <= 0) {
    return { isValid: false, error: 'Queue entry sequence number must be a positive integer.' };
  }

  // Validate sync state
  if (item.syncState !== 'pending') {
    return { isValid: false, error: 'Queue entry must have a pending sync state.' };
  }

  // Validate update structure and discriminator
  if (!isRecord(item.update) || typeof item.update.type !== 'string' || !isRecord(item.update.payload)) {
    return { isValid: false, error: 'Queue entry update payload is malformed.' };
  }

  const update = item.update;
  const payload: Record<string, unknown> = isRecord(update.payload) ? update.payload : {};

  if (update.type === 'field-update') {
    const fieldNotes = payload.fieldNotes;
    if (typeof fieldNotes !== 'string') {
      return { isValid: false, error: 'Field update notes must be a string.' };
    }
    const notesError = validateFieldNotes(fieldNotes);
    if (notesError) {
      return { isValid: false, error: notesError };
    }
    return { isValid: true, validatedItem: item as QueuedResponderUpdate };
  }

  if (update.type === 'progress') {
    const status = payload.status;
    if (!isStatus(status)) {
      return { isValid: false, error: 'Progress update specifies an invalid status.' };
    }
    if (!isValidResponseProgressTransition(item.expectedStatus, status)) {
      return { isValid: false, error: `Invalid progress transition from ${item.expectedStatus} to ${status}.` };
    }
    if (status === 'COMPLETED') {
      const details = payload.completionDetails;
      if (
        !isRecord(details) ||
        typeof details.assistanceProvided !== 'string' ||
        typeof details.completionSummary !== 'string'
      ) {
        return { isValid: false, error: 'Completed progress updates require valid completion details.' };
      }
      const remarks = details.responderRemarks;
      const completionError = validateCompletionDetails({
        assistanceProvided: details.assistanceProvided,
        completionSummary: details.completionSummary,
        ...(typeof remarks === 'string' ? { responderRemarks: remarks } : {})
      });
      if (completionError) {
        return { isValid: false, error: completionError };
      }
    }
    return { isValid: true, validatedItem: item as QueuedResponderUpdate };
  }

  return { isValid: false, error: 'Queue entry contains an unsupported update type.' };
}


export function createResponderSyncService(
  queue: ResponderUpdateQueue,
  connectivityStore: { getSnapshot: () => Connectivity; subscribe: (listener: () => void) => () => void },
  api: ResponderSyncApi,
  cache: ResponderSyncCache
) {
  // In-flight synchronization lock per responder to prevent overlapping queue drains
  // when multiple connectivity events fire or components mount concurrently.
  const inFlightSyncs = new Map<string, Promise<SyncResult>>();

  // Per-responder sync state snapshots for external store subscribers
  const snapshots = new Map<string, SyncState>();
  const listeners = new Set<() => void>();

  // Permanent failure tracker per local item ID to avoid hammering the backend on unresolvable conflicts
  const permanentFailures = new Map<string, { error: string; timestamp: number }>();

  // Controlled retry tracking: count consecutive temporary failures to avoid tight infinite retry loops
  const temporaryFailureCounts = new Map<string, { count: number; cooldownUntil: number }>();

  // Active session context registered by foreground responder workflows
  let activeSession: { owner: string; accessToken: string } | null = null;

  const getSnapshot = (owner: string): SyncState => snapshots.get(owner) ?? initialSyncState;

  const publish = (owner: string, state: SyncState) => {
    snapshots.set(owner, state);
    listeners.forEach((notify) => notify());
  };

  // Convert technical networking or server errors into clear, responder-friendly status messages
  function friendlySyncErrorMessage(error: unknown): string {
    if (error instanceof ApiClientError) {
      if (error.status === 0) {
        return 'Sync paused. We’ll retry when the connection is available.';
      }
      if (error.status === 401) {
        return 'Please log in again to sync your saved updates.';
      }
      if (error.status === 403) {
        return 'You are no longer assigned to this emergency request.';
      }
      if (error.status === 404) {
        return 'This emergency request could not be found on the server.';
      }
      if (error.status === 409) {
        return 'This emergency request has changed on the server. Please review its status.';
      }
      if (error.status >= 500) {
        return 'Unable to sync updates right now. We’ll retry shortly.';
      }
      return 'Some saved updates could not be processed. Please review the request.';
    }
    return 'Unable to sync saved updates right now. We’ll retry shortly.';
  }

  // Perform sequential FIFO synchronization of queued updates for a specific responder
  async function executeSync(
    owner: string,
    accessToken: string,
    options?: SyncOptions
  ): Promise<SyncResult> {
    const currentState = getSnapshot(owner);

    // Check if network is online before attempting queue drain
    if (connectivityStore.getSnapshot() !== 'online') {
      publish(owner, {
        ...currentState,
        status: 'paused',
        isSyncing: false,
        lastError: 'Sync paused. We’ll retry when the connection is available.'
      });
      return {
        success: false,
        syncedRequests: [],
        syncedCount: 0,
        remainingCount: queue.getSnapshot(owner).items.length,
        error: 'Sync paused. We’ll retry when the connection is available.'
      };
    }

    // Ensure queue data is loaded from local storage before checking items
    const queueState = queue.getSnapshot(owner).status === 'ready'
      ? queue.getSnapshot(owner)
      : await queue.load(owner);

    // Scenario 1: Empty queue reconnection should terminate immediately with no API calls
    if (queueState.status !== 'ready' || queueState.items.length === 0) {
      publish(owner, {
        status: 'idle',
        isSyncing: false,
        syncedCount: 0,
        lastError: null,
        lastSyncedAt: currentState.lastSyncedAt
      });
      return {
        success: true,
        syncedRequests: [],
        syncedCount: 0,
        remainingCount: 0
      };
    }

    // Check cooldown for temporary failure backoff to avoid continuous tight retry loops
    const headItemId = queueState.items[0]?.localId;
    const retryInfo = headItemId ? temporaryFailureCounts.get(headItemId) : undefined;
    if (retryInfo && Date.now() < retryInfo.cooldownUntil) {
      return {
        success: false,
        syncedRequests: [],
        syncedCount: 0,
        remainingCount: queueState.items.length,
        error: currentState.lastError
      };
    }

    // If the head item previously encountered a permanent conflict, do not hammer backend
    if (headItemId && permanentFailures.has(headItemId)) {
      const permanent = permanentFailures.get(headItemId)!;
      publish(owner, {
        ...currentState,
        status: 'error',
        isSyncing: false,
        lastError: permanent.error
      });
      return {
        success: false,
        syncedRequests: [],
        syncedCount: 0,
        remainingCount: queueState.items.length,
        error: permanent.error
      };
    }

    // Transition to syncing state
    publish(owner, {
      status: 'syncing',
      isSyncing: true,
      syncedCount: 0,
      lastError: null,
      lastSyncedAt: currentState.lastSyncedAt
    });

    const syncedRequests: SafeResponseRequest[] = [];

    // Process lifecycle updates sequentially because later responder states
    // depend on the backend accepting the previous transition first.
    while (true) {
      // Check network reachability before each sequential operation
      if (connectivityStore.getSnapshot() !== 'online') {
        publish(owner, {
          status: 'paused',
          isSyncing: false,
          syncedCount: syncedRequests.length,
          lastError: 'Sync paused. We’ll retry when the connection is available.',
          lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
        });
        break;
      }

      // Re-read snapshot to inspect the authoritative FIFO head
      const currentQueue = queue.getSnapshot(owner);
      if (currentQueue.status !== 'ready' || currentQueue.items.length === 0) {
        // All items have been processed successfully
        publish(owner, {
          status: 'success',
          isSyncing: false,
          syncedCount: syncedRequests.length,
          lastError: null,
          lastSyncedAt: new Date().toISOString()
        });
        break;
      }

      const item = currentQueue.items[0];

      // Validate queue item structure, ownership, and boundaries before submitting
      const validation = validateQueueItemForProcessing(item, owner);
      if (!validation.isValid) {
        // Corrupted item cannot be safely processed. Stop queue drain to protect lifecycle integrity.
        permanentFailures.set(item.localId, { error: validation.error, timestamp: Date.now() });
        publish(owner, {
          status: 'error',
          isSyncing: false,
          syncedCount: syncedRequests.length,
          lastError: validation.error,
          lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
        });
        break;
      }

      const validItem = validation.validatedItem;

      try {
        let confirmedRequest: SafeResponseRequest;

        if (validItem.update.type === 'field-update') {
          confirmedRequest = await api.saveResponderFieldUpdate(
            validItem.requestId,
            validItem.update.payload.fieldNotes,
            accessToken
          );
        } else if (validItem.update.type === 'progress') {
          confirmedRequest = await api.updateResponderRequestProgress(
            validItem.requestId,
            validItem.update.payload.status,
            accessToken,
            validItem.update.payload.completionDetails
          );
        } else {
          throw new Error('Unsupported responder update type');
        }

        // Backend confirmed success: only remove the queue item after verified acknowledgement
        await queue.remove(owner, validItem.localId);
        syncedRequests.push(confirmedRequest);

        // Clear temporary failure count on successful progress
        temporaryFailureCounts.delete(validItem.localId);

        // Update cached request immediately so subsequent UI reads reflect backend state
        cache.updateCachedResponderRequest(confirmedRequest);

      } catch (error) {
        // Scenario 4 & 10: Idempotency recovery. If the backend returned a 409 conflict,
        // verify whether the update was already committed during a previous attempt
        // where the client disconnected before receiving the 200 OK acknowledgment.
        if (error instanceof ApiClientError && error.status === 409) {
          try {
            const serverRequest = await api.getResponderRequestById(validItem.requestId, accessToken);
            if (serverRequest) {
              const alreadyMatches = validItem.update.type === 'progress'
                ? serverRequest.status === validItem.update.payload.status
                : validItem.update.type === 'field-update' && serverRequest.fieldNotes === validItem.update.payload.fieldNotes;

              if (alreadyMatches) {
                // The backend already accepted this exact transition in a previous attempt.
                // Acknowledge and remove the queue item to safely recover without duplicate execution.
                await queue.remove(owner, validItem.localId);
                syncedRequests.push(serverRequest);
                temporaryFailureCounts.delete(validItem.localId);
                cache.updateCachedResponderRequest(serverRequest);
                continue; // Continue FIFO queue drain for subsequent items
              }
            }
          } catch {
            // Secondary lookup failed, proceed to permanent conflict handling
          }
        }

        // Determine failure classification
        const isNetworkDrop = connectivityStore.getSnapshot() !== 'online'
          || (error instanceof ApiClientError && error.status === 0)
          || (error instanceof TypeError && error.message.toLowerCase().includes('fetch'));

        if (isNetworkDrop) {
          // Keep the failed item in the queue so a temporary network interruption
          // cannot silently discard the responder's offline work.
          publish(owner, {
            status: 'paused',
            isSyncing: false,
            syncedCount: syncedRequests.length,
            lastError: 'Sync paused. We’ll retry when the connection is available.',
            lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
          });
          break;
        }

        if (error instanceof ApiClientError) {
          if (error.status === 401) {
            // Authentication token expired. Retain queue items safely on device and prompt user.
            publish(owner, {
              status: 'error',
              isSyncing: false,
              syncedCount: syncedRequests.length,
              lastError: 'Please log in again to sync your saved updates.',
              lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
            });
            break;
          }

          if (error.status === 403 || error.status === 409 || error.status === 400 || error.status === 404) {
            // Permanent failure or lifecycle conflict. Halt processing so later dependent
            // updates are not sent out of order against an incompatible server state.
            const friendlyMessage = friendlySyncErrorMessage(error);
            permanentFailures.set(validItem.localId, { error: friendlyMessage, timestamp: Date.now() });
            publish(owner, {
              status: 'error',
              isSyncing: false,
              syncedCount: syncedRequests.length,
              lastError: friendlyMessage,
              lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
            });
            break;
          }

          if (error.status >= 500) {
            // Temporary server failure: retain item and apply controlled backoff
            const currentAttempt = temporaryFailureCounts.get(validItem.localId)?.count ?? 0;
            const nextAttempt = currentAttempt + 1;
            // Backoff cooldown: 10s for first failure, 30s for repeated failures
            const cooldownMs = nextAttempt >= 2 ? 30000 : 10000;
            temporaryFailureCounts.set(validItem.localId, {
              count: nextAttempt,
              cooldownUntil: Date.now() + cooldownMs
            });

            publish(owner, {
              status: 'error',
              isSyncing: false,
              syncedCount: syncedRequests.length,
              lastError: 'Unable to sync updates right now. We’ll retry shortly.',
              lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
            });
            break;
          }
        }

        // Generic unexpected error: treat safely as temporary
        publish(owner, {
          status: 'error',
          isSyncing: false,
          syncedCount: syncedRequests.length,
          lastError: friendlySyncErrorMessage(error),
          lastSyncedAt: syncedRequests.length > 0 ? new Date().toISOString() : currentState.lastSyncedAt
        });
        break;
      }
    }

    const remainingCount = queue.getSnapshot(owner).items.length;
    const finalSyncState = getSnapshot(owner);

    // Refresh request data callback after successful synchronization
    if (syncedRequests.length > 0 && options?.onSyncSuccess) {
      try {
        await options.onSyncSuccess(syncedRequests);
      } catch {
        // Callback errors should not alter sync status
      }
    }

    return {
      success: remainingCount === 0,
      syncedRequests,
      syncedCount: syncedRequests.length,
      remainingCount,
      error: finalSyncState.lastError
    };
  }

  // Guard against overlapping queue drains when NetInfo emits multiple
  // reconnect events during network recovery or components remount.
  function syncQueue(owner: string, accessToken: string, options?: SyncOptions): Promise<SyncResult> {
    const existing = inFlightSyncs.get(owner);
    if (existing) {
      // Re-use active in-flight sync promise to prevent duplicate concurrent network operations
      return existing;
    }

    const syncPromise = executeSync(owner, accessToken, options).finally(() => {
      inFlightSyncs.delete(owner);
    });

    inFlightSyncs.set(owner, syncPromise);
    return syncPromise;
  }

  // Track previous connectivity state to detect true transitions to online
  let lastConnectivity: Connectivity = connectivityStore.getSnapshot();
  let stopListening: (() => void) | null = null;

  function ensureConnectivityListening() {
    if (stopListening) return;
    lastConnectivity = connectivityStore.getSnapshot();
    stopListening = connectivityStore.subscribe(() => {
      const currentConnectivity = connectivityStore.getSnapshot();

      // Detect true transition to online: previous was offline or unknown, now online
      const isTransitionToOnline = (lastConnectivity === 'offline' || lastConnectivity === 'unknown')
        && currentConnectivity === 'online';

      lastConnectivity = currentConnectivity;

      if (isTransitionToOnline && activeSession) {
        const { owner, accessToken } = activeSession;
        const snapshot = queue.getSnapshot(owner);

        // Only start synchronization if queued responder updates exist.
        // Avoid unnecessary work and repeated sync loops when the queue is empty.
        if (snapshot.status === 'ready' && snapshot.items.length > 0) {
          void syncQueue(owner, accessToken);
        }
      }
    });
  }

  function stopConnectivityListening() {
    if (stopListening) {
      stopListening();
      stopListening = null;
    }
  }

  return {
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    syncQueue,
    // Explicit sync trigger for manual retry from the UI banner
    retrySync(owner: string, accessToken: string, options?: SyncOptions) {
      // Clear permanent failure and cooldown records so explicit retry can re-evaluate
      const snapshot = queue.getSnapshot(owner);
      const headId = snapshot.items[0]?.localId;
      if (headId) {
        permanentFailures.delete(headId);
        temporaryFailureCounts.delete(headId);
      }
      return syncQueue(owner, accessToken, options);
    },
    // Foreground screen registers active authenticated session to enable automatic reconnect sync
    setActiveSession(session: { owner: string; accessToken: string } | null) {
      activeSession = session;
      if (session) {
        ensureConnectivityListening();
        if (connectivityStore.getSnapshot() === 'online') {
          const snapshot = queue.getSnapshot(session.owner);
          if (snapshot.status === 'ready' && snapshot.items.length > 0) {
            void syncQueue(session.owner, session.accessToken);
          }
        }
      } else {
        stopConnectivityListening();
      }
    },
    clearActiveSession(owner?: string) {
      if (!owner || activeSession?.owner === owner) {
        activeSession = null;
        stopConnectivityListening();
      }
    },
    destroy() {
      stopConnectivityListening();
      listeners.clear();
      inFlightSyncs.clear();
      snapshots.clear();
      permanentFailures.clear();
      temporaryFailureCounts.clear();
    }
  };
}


export type ResponderSyncService = ReturnType<typeof createResponderSyncService>;
