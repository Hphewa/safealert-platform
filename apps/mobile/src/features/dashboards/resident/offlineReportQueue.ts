import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReportHazardDraft } from './reportDraft';

export type OfflineReportQueueStatus = 'PENDING' | 'SYNCING' | 'FAILED';

export type OfflineReportQueueItem = {
  id: string;
  operationId: string;
  draft: ReportHazardDraft;
  status: OfflineReportQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

const queueKeyPrefix = 'safealert:resident-report-queue:v1:';
const draftKeyPrefix = 'safealert:resident-report-draft:v1:';
function queueKey(userId: string) {
  return `${queueKeyPrefix}${userId}`;
}

function draftKey(userId: string) {
  return `${draftKeyPrefix}${userId}`;
}

export function createReportOperationId() {
  return `resident-report-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function readPersistedReportDraft(userId: string) {
  const value = await AsyncStorage.getItem(draftKey(userId));
  return value ? (JSON.parse(value) as ReportHazardDraft) : null;
}

export async function writePersistedReportDraft(userId: string, draft: ReportHazardDraft) {
  if (isEmptyReportDraft(draft)) {
    await AsyncStorage.removeItem(draftKey(userId));
    return;
  }

  await AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft));
}

export async function clearPersistedReportDraft(userId: string) {
  await AsyncStorage.removeItem(draftKey(userId));
}

export async function listQueuedReports(userId: string) {
  const value = await AsyncStorage.getItem(queueKey(userId));
  if (!value) return [];

  try {
    return JSON.parse(value) as OfflineReportQueueItem[];
  } catch {
    await AsyncStorage.removeItem(queueKey(userId));
    return [];
  }
}

export async function enqueueReportSubmission(
  userId: string,
  draft: ReportHazardDraft,
  operationId: string
) {
  const existing = await listQueuedReports(userId);
  const existingItem = existing.find((item) => item.operationId === operationId);
  if (existingItem) return existingItem;

  const now = new Date().toISOString();
  const item: OfflineReportQueueItem = {
    id: createReportOperationId(),
    operationId,
    draft,
    status: 'PENDING',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    lastError: null
  };

  await AsyncStorage.setItem(queueKey(userId), JSON.stringify([item, ...existing]));
  return item;
}

export async function updateQueuedReport(
  userId: string,
  id: string,
  update: Partial<Pick<OfflineReportQueueItem, 'status' | 'attempts' | 'lastError'>>
) {
  const items = await listQueuedReports(userId);
  const next = items.map((item) =>
    item.id === id
      ? { ...item, ...update, updatedAt: new Date().toISOString() }
      : item
  );
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(next));
  return next;
}

export async function removeQueuedReport(userId: string, id: string) {
  const items = await listQueuedReports(userId);
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(items.filter((item) => item.id !== id)));
}

function isEmptyReportDraft(draft: ReportHazardDraft) {
  return !draft.hazardType &&
    !draft.otherHazardType?.trim() &&
    draft.location.status === 'REQUESTING_PERMISSION' &&
    draft.photoEvidence.status === 'EMPTY' &&
    draft.voiceEvidence.status === 'EMPTY' &&
    !draft.severity &&
    !draft.description.trim();
}
