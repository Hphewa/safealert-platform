import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { saveResponderFieldUpdate } from '../api/responderFieldUpdateApi';
import { updateResponderRequestProgress } from '../api/responderProgressApi';
import { canManageResponderProgress } from '../progressUi';
import type { Connectivity } from './connectivity';
import {
  OfflineUpdateError, projectQueuedUpdates, validateResponderUpdate,
  type ResponderUpdate, type ResponderUpdateQueue
} from './responderUpdateQueue';

export type SaveResponderUpdateResult =
  | { saved: 'local' }
  | { saved: 'server'; request: SafeResponseRequest };

export async function saveResponderUpdate(input: {
  request: SafeResponseRequest;
  user: SafeUser | null;
  accessToken: string;
  update: ResponderUpdate;
}, queue: ResponderUpdateQueue, connectivity: () => Connectivity): Promise<SaveResponderUpdateResult> {
  const { request, user, accessToken, update } = input;
  if (!user || !accessToken.trim() || !canManageResponderProgress(request, user)) {
    throw new OfflineUpdateError('Only the assigned responder can save updates for this request.');
  }
  const state = queue.getSnapshot(user.id).status === 'ready'
    ? queue.getSnapshot(user.id) : await queue.load(user.id);
  if (state.status !== 'ready') throw new OfflineUpdateError(state.error ?? 'Unable to read saved updates. Please retry.');
  const projected = projectQueuedUpdates(request, state.items);
  if (projected.conflict) {
    throw new OfflineUpdateError('This request has changed on the server. Pending updates need review before more updates can be saved.');
  }
  // Preserve the existing online completion validation in the API. Offline completion
  // must include its required details because no server can validate the local save yet.
  const mustQueue = connectivity() !== 'online' || state.items.some((item) => item.requestId === request.id);
  if (mustQueue) {
    await queue.enqueue(user.id, request, update);
    return { saved: 'local' };
  }
  if (update.type === 'field-update' && !validateResponderUpdate(request.status, update)) {
    throw new OfflineUpdateError('Check the field notes and current request status before saving.');
  }
  // Never auto-queue an uncertain online response: the server may already have committed it.
  // Later updates to a request with pending work stay queued even after reconnection,
  // otherwise an online mutation could overtake an unsent lifecycle transition.
  const updated = update.type === 'field-update'
    ? await saveResponderFieldUpdate(request.id, update.payload.fieldNotes, accessToken)
    : await updateResponderRequestProgress(request.id, update.payload.status, accessToken, update.payload.completionDetails);
  return { saved: 'server', request: updated };
}
