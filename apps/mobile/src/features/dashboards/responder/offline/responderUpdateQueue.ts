import {
  RESPONSE_ACTIVE_ASSIGNED_STATUSES, RESPONSE_STATUSES, isValidResponseProgressTransition,
  type ResponseStatus, type SafeResponseRequest
} from '@safealert/contracts';
import type { ResponderCompletionDetails, ResponderProgressStatus } from '../api/responderProgressApi';
import { validateCompletionDetails, validateFieldNotes } from '../fieldUpdateUi';

export type ResponderUpdate =
  | { type: 'field-update'; payload: { fieldNotes: string } }
  | { type: 'progress'; payload: { status: ResponderProgressStatus; completionDetails?: ResponderCompletionDetails } };

export type QueuedResponderUpdate = {
  localId: string;
  responderId: string;
  requestId: string;
  expectedStatus: ResponseStatus;
  update: ResponderUpdate;
  createdAt: string;
  sequence: number;
  syncState: 'pending';
};
export type QueueSnapshot = {
  items: readonly QueuedResponderUpdate[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
};
export class OfflineUpdateError extends Error {}
const initialSnapshot: QueueSnapshot = { items: [], status: 'loading', error: null };
const storageMessage = 'Unable to access saved updates on this device. Retry before saving more updates.';
const corruptMessage = 'Saved updates could not be read. They have been kept on this device. Retry before saving more updates.';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const isOwnerId = (value: string) => /^[a-z\d_-]{1,128}$/i.test(value);
const isStatus = (value: unknown): value is ResponseStatus => RESPONSE_STATUSES.some((status) => status === value);

export function validateResponderUpdate(status: ResponseStatus, update: unknown): update is ResponderUpdate {
  if (!isRecord(update) || !onlyKeys(update, ['type', 'payload']) || !isRecord(update.payload)) return false;
  const payload = update.payload;
  if (update.type === 'field-update') {
    return onlyKeys(payload, ['fieldNotes']) && RESPONSE_ACTIVE_ASSIGNED_STATUSES.some((candidate) => candidate === status)
      && typeof payload.fieldNotes === 'string' && !validateFieldNotes(payload.fieldNotes);
  }
  if (update.type !== 'progress' || !onlyKeys(payload, ['status', 'completionDetails']) || !isStatus(payload.status)
    || !isValidResponseProgressTransition(status, payload.status)) return false;
  if (payload.status !== 'COMPLETED') return payload.completionDetails === undefined;
  const details = payload.completionDetails;
  return isRecord(details) && onlyKeys(details, ['assistanceProvided', 'completionSummary', 'responderRemarks'])
    && typeof details.assistanceProvided === 'string'
    && typeof details.completionSummary === 'string'
    && (details.responderRemarks === undefined || typeof details.responderRemarks === 'string')
    && !validateCompletionDetails({
      assistanceProvided: details.assistanceProvided,
      completionSummary: details.completionSummary,
      ...(typeof details.responderRemarks === 'string' ? { responderRemarks: details.responderRemarks } : {})
    });
}

function validItem(value: unknown, owner: string): value is QueuedResponderUpdate {
  return isRecord(value) && onlyKeys(value, ['localId', 'responderId', 'requestId', 'expectedStatus', 'update', 'createdAt', 'sequence', 'syncState'])
    && typeof value.localId === 'string' && /^[a-z\d-]{1,100}$/i.test(value.localId)
    && value.responderId === owner && typeof value.requestId === 'string' && /^[a-f\d]{24}$/i.test(value.requestId)
    && isStatus(value.expectedStatus) && validateResponderUpdate(value.expectedStatus, value.update)
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.sequence === 'number' && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && value.syncState === 'pending';
}

// Only replay data is persisted: never tokens, resident contact details, GPS, or request snapshots.
function normalizeUpdate(update: ResponderUpdate): ResponderUpdate {
  if (update.type === 'field-update') return { type: update.type, payload: { fieldNotes: update.payload.fieldNotes.trim() } };
  const details = update.payload.completionDetails;
  return { type: update.type, payload: { status: update.payload.status, ...(details ? {
    completionDetails: {
      assistanceProvided: details.assistanceProvided.trim(), completionSummary: details.completionSummary.trim(),
      ...(details.responderRemarks?.trim() ? { responderRemarks: details.responderRemarks.trim() } : {})
    }
  } : {}) } };
}

export function projectQueuedUpdates(request: SafeResponseRequest, items: readonly QueuedResponderUpdate[]) {
  let projected = request;
  for (const item of items.filter((item) => item.requestId === request.id)) {
    // Do not reinterpret pending work against a changed assignment or server lifecycle.
    if (item.responderId !== request.assignedResponderId || item.expectedStatus !== projected.status) {
      return { request, conflict: true };
    }
    projected = item.update.type === 'field-update'
      ? { ...projected, fieldNotes: item.update.payload.fieldNotes }
      : { ...projected, status: item.update.payload.status, ...item.update.payload.completionDetails };
  }
  return { request: projected, conflict: false };
}

export function createResponderUpdateQueue(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}) {
  const snapshots = new Map<string, QueueSnapshot>();
  const listeners = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  const getSnapshot = (owner: string) => snapshots.get(owner) ?? initialSnapshot;
  const publish = (owner: string, state: QueueSnapshot) => {
    snapshots.set(owner, state);
    listeners.forEach((listener) => listener());
  };
  // Serialize read-modify-write operations so simultaneous screens cannot lose FIFO entries.
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    // The caller receives the failure; only the scheduling chain recovers so a retry can run.
    tail = result.catch(() => undefined);
    return result;
  }
  const key = (owner: string) => `safealert.responder-updates.v1.${owner}`;
  async function read(owner: string) {
    if (!isOwnerId(owner)) {
      publish(owner, { items: [], status: 'error', error: 'Please log in again to access your saved updates.' });
      return getSnapshot(owner);
    }
    let raw: string | null;
    try { raw = await storage.getItem(key(owner)); }
    catch {
      publish(owner, { items: [], status: 'error', error: storageMessage });
      return getSnapshot(owner);
    }
    try {
      const data: unknown = raw === null ? { version: 1, items: [] } : JSON.parse(raw);
      if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.items)) throw new Error('Invalid queue');
      const items: QueuedResponderUpdate[] = [];
      for (const item of data.items) {
        if (!validItem(item, owner)) throw new Error('Invalid queue item');
        items.push(item);
      }
      const ids = new Set<string>();
      const statuses = new Map<string, ResponseStatus>();
      let lastSequence = 0;
      for (const item of items) {
        if (ids.has(item.localId) || item.sequence <= lastSequence
          || (statuses.has(item.requestId) && statuses.get(item.requestId) !== item.expectedStatus)) throw new Error('Invalid order');
        ids.add(item.localId);
        lastSequence = item.sequence;
        statuses.set(item.requestId, item.update.type === 'progress' ? item.update.payload.status : item.expectedStatus);
      }
      publish(owner, { items, status: 'ready', error: null });
    } catch {
      // Preserve unreadable data instead of silently overwriting potentially unsent emergency updates.
      publish(owner, { items: [], status: 'error', error: corruptMessage });
    }
    return getSnapshot(owner);
  }
  async function ready(owner: string) {
    const state = getSnapshot(owner).status === 'ready' ? getSnapshot(owner) : await read(owner);
    if (state.status !== 'ready') throw new OfflineUpdateError(state.error ?? storageMessage);
    return state;
  }
  async function persist(owner: string, items: readonly QueuedResponderUpdate[]) {
    try { await storage.setItem(key(owner), JSON.stringify({ version: 1, items })); }
    catch { throw new OfflineUpdateError('Unable to save on this device. Your update was not saved. Please retry.'); }
    // Publish only after durable storage succeeds; local feedback must never imply a lost write was saved.
    publish(owner, { items, status: 'ready', error: null });
  }
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: (owner: string) => serial(() => read(owner)),
    enqueue: (owner: string, request: SafeResponseRequest, update: ResponderUpdate) => serial(async () => {
      const state = await ready(owner);
      const projected = projectQueuedUpdates(request, state.items);
      if (projected.conflict || request.assignedResponderId !== owner || !/^[a-f\d]{24}$/i.test(request.id)
        || !validateResponderUpdate(projected.request.status, update)) {
        throw new OfflineUpdateError('This update is not allowed for the current request. Check its progress and required details.');
      }
      const sequence = (state.items.at(-1)?.sequence ?? 0) + 1;
      if (!Number.isSafeInteger(sequence) || state.items.length >= 500) {
        throw new OfflineUpdateError('This device has too many pending updates to save another update.');
      }
      const item: QueuedResponderUpdate = {
        localId: `${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2)}`,
        responderId: owner, requestId: request.id, expectedStatus: projected.request.status,
        update: normalizeUpdate(update), createdAt: new Date().toISOString(), sequence, syncState: 'pending'
      };
      await persist(owner, [...state.items, item]);
      return item;
    }),
    // Explicit acknowledgement is reserved for the future synchronizer; nothing drains on reconnect.
    remove: (owner: string, localId: string) => serial(async () => {
      const state = await ready(owner);
      const first = state.items[0];
      if (first?.localId !== localId) throw new OfflineUpdateError('Saved updates must be handled in order.');
      await persist(owner, state.items.slice(1));
    })
  };
}
export type ResponderUpdateQueue = ReturnType<typeof createResponderUpdateQueue>;
