import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { CreateResponseRequestRequest, CreateResponseRequestResponse } from '@safealert/contracts';
import { ApiClientError } from '../../../services/api/client';
import { createResidentResponseRequest } from './api/responseRequestApi';

export type EmergencyRequestQueueItem = {
  id: string;
  operationId: string;
  payload: CreateResponseRequestRequest;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

const queuePrefix = 'safealert:resident-emergency-request-queue:v1:';
const keyFor = (userId: string) => `${queuePrefix}${userId}`;
const createOperationId = () => `resident-emergency-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

function isNetworkError(error: unknown) {
  return (error instanceof ApiClientError && (error.status === 0 || error.code === 'NETWORK_ERROR')) ||
    (error instanceof TypeError && error.message.toLowerCase().includes('fetch'));
}
export async function residentHelpIsOnline() {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
}
export async function listQueuedEmergencyRequests(userId: string) {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    return value ? JSON.parse(value) as EmergencyRequestQueueItem[] : [];
  } catch { return []; }
}
async function writeQueue(userId: string, items: EmergencyRequestQueueItem[]) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
}
export async function enqueueEmergencyRequest(userId: string, payload: CreateResponseRequestRequest) {
  const items = await listQueuedEmergencyRequests(userId);
  const now = new Date().toISOString();
  const operationId = createOperationId();
  const item: EmergencyRequestQueueItem = {
    id: operationId, operationId, payload, status: 'PENDING', attempts: 0,
    createdAt: now, updatedAt: now, lastError: null
  };
  await writeQueue(userId, [item, ...items]);
  return item;
}
export async function saveEmergencyRequestWithOfflineSupport(input: {
  userId: string; accessToken: string; payload: CreateResponseRequestRequest;
  saveOnline?: (operationId?: string) => Promise<CreateResponseRequestResponse>;
}) {
  const operationId = createOperationId();
  if (!(await residentHelpIsOnline())) {
    const items = await listQueuedEmergencyRequests(input.userId);
    const now = new Date().toISOString();
    await writeQueue(input.userId, [{ id: operationId, operationId, payload: input.payload, status: 'PENDING', attempts: 0,
      createdAt: now, updatedAt: now, lastError: null }, ...items]);
    return { saved: 'local' as const };
  }
  try {
    const response = await (input.saveOnline ?? ((key) => createResidentResponseRequest(input.payload, input.accessToken, key)))(operationId);
    return { saved: 'server' as const, response };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const items = await listQueuedEmergencyRequests(input.userId);
    const now = new Date().toISOString();
    await writeQueue(input.userId, [{ id: operationId, operationId, payload: input.payload, status: 'PENDING', attempts: 0,
      createdAt: now, updatedAt: now, lastError: null }, ...items]);
    return { saved: 'local' as const };
  }
}

export async function syncQueuedEmergencyRequests(userId: string, accessToken: string) {
  if (!(await residentHelpIsOnline())) return { synced: 0, remaining: (await listQueuedEmergencyRequests(userId)).length };
  let synced = 0;
  for (const item of await listQueuedEmergencyRequests(userId)) {
    const current = await listQueuedEmergencyRequests(userId);
    if (!current.some((candidate) => candidate.id === item.id)) continue;
    await writeQueue(userId, current.map((candidate) => candidate.id === item.id
      ? { ...candidate, status: 'SYNCING' as const, attempts: candidate.attempts + 1, lastError: null, updatedAt: new Date().toISOString() }
      : candidate));
    try {
      await createResidentResponseRequest(item.payload, accessToken, item.operationId);
      await writeQueue(userId, (await listQueuedEmergencyRequests(userId)).filter((candidate) => candidate.id !== item.id));
      synced += 1;
    } catch (error) {
      const message = isNetworkError(error) ? 'Sync paused until your connection returns.'
        : error instanceof Error ? error.message : 'Your emergency request could not be synchronized.';
      await writeQueue(userId, (await listQueuedEmergencyRequests(userId)).map((candidate) => candidate.id === item.id
        ? { ...candidate, status: 'FAILED' as const, lastError: message, updatedAt: new Date().toISOString() } : candidate));
      break;
    }
  }
  return { synced, remaining: (await listQueuedEmergencyRequests(userId)).length };
}
