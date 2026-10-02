import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type {
  CreateRiskAssessmentRequest, ReassessRiskAssessmentRequest, RiskAssessmentResponse, SafeRiskAssessment
} from '@safealert/contracts';
import { ApiClientError } from '../../../../services/api/client';
import {
  createRiskAssessment, getRiskAssessment, getRiskAssessmentForIncident, getRiskAssessmentHistory,
  reassessRiskAssessment
} from '../api/riskAssessmentApi';

type AssessmentQueuePayload =
  | { mode: 'INITIAL'; request: CreateRiskAssessmentRequest }
  | { mode: 'REASSESSMENT'; assessmentId: string; incidentId: string; request: ReassessRiskAssessmentRequest };

export type OfficerAssessmentQueueItem = AssessmentQueuePayload & {
  id: string; operationId: string; status: 'PENDING' | 'SYNCING' | 'FAILED'; attempts: number;
  createdAt: string; updatedAt: string; lastError: string | null;
};

const keyPrefix = 'safealert:officer-assessment-queue:v1:';
const keyFor = (userId: string) => `${keyPrefix}${userId}`;

function operationId() { return `officer-assessment-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
function isNetworkError(error: unknown) {
  return (error instanceof ApiClientError && error.status === 0) ||
    (error instanceof TypeError && error.message.toLowerCase().includes('fetch'));
}
export async function isOfficerAssessmentOnline() {
  const network = await NetInfo.fetch();
  return network.isConnected === true && network.isInternetReachable !== false;
}
function sameAssessment(a: SafeRiskAssessment, b: CreateRiskAssessmentRequest | ReassessRiskAssessmentRequest) {
  return a.incidentId === ('incidentId' in b ? b.incidentId : a.incidentId) &&
    a.hazardSeverity === b.hazardSeverity && a.peopleAffected === b.peopleAffected &&
    a.vulnerablePeople === b.vulnerablePeople && a.roadAccessibility === b.roadAccessibility &&
    a.infrastructureImpact === b.infrastructureImpact && a.waterLevelTrend === b.waterLevelTrend &&
    a.weatherCondition === b.weatherCondition && a.finalRiskLevel === b.finalRiskLevel &&
    (a.decisionReason ?? '') === (b.decisionReason ?? '');
}

export async function listOfficerAssessmentQueue(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? JSON.parse(raw) as OfficerAssessmentQueueItem[] : [];
  } catch { return []; }
}
async function writeQueue(userId: string, items: OfficerAssessmentQueueItem[]) {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(items));
}
export async function enqueueOfficerAssessment(userId: string, payload: AssessmentQueuePayload) {
  const items = await listOfficerAssessmentQueue(userId);
  const now = new Date().toISOString();
  const item: OfficerAssessmentQueueItem = { ...payload, id: operationId(), operationId: operationId(),
    status: 'PENDING', attempts: 0, createdAt: now, updatedAt: now, lastError: null };
  await writeQueue(userId, [item, ...items]);
  return item;
}
async function remove(userId: string, id: string) {
  await writeQueue(userId, (await listOfficerAssessmentQueue(userId)).filter((item) => item.id !== id));
}
async function fail(userId: string, item: OfficerAssessmentQueueItem, error: unknown) {
  const message = isNetworkError(error) ? 'Sync paused until the officer is back online.'
    : error instanceof Error ? error.message : 'This assessment could not be synchronized.';
  const items = await listOfficerAssessmentQueue(userId);
  await writeQueue(userId, items.map((current) => current.id === item.id
    ? { ...current, status: 'FAILED' as const, attempts: current.attempts + 1, lastError: message, updatedAt: new Date().toISOString() }
    : current));
}

async function syncInitial(item: Extract<OfficerAssessmentQueueItem, { mode: 'INITIAL' }>, accessToken: string) {
  const current = await getRiskAssessmentForIncident(item.request.incidentId, accessToken);
  if (current.assessment) {
    if (sameAssessment(current.assessment, item.request)) return;
    throw new Error('The incident already has a different risk assessment. Review it before retrying.');
  }
  await createRiskAssessment(item.request, accessToken);
}
async function syncReassessment(item: Extract<OfficerAssessmentQueueItem, { mode: 'REASSESSMENT' }>, accessToken: string) {
  const current = await getRiskAssessment(item.assessmentId, accessToken);
  if (current.assessment.status !== 'ACTIVE') {
    const history = await getRiskAssessmentHistory(item.incidentId, accessToken);
    const committed = history.assessments.find((assessment) => assessment.previousAssessmentId === item.assessmentId &&
      sameAssessment(assessment, { ...item.request, incidentId: item.incidentId }));
    if (committed) return;
    throw new Error('The previous assessment is no longer active. Review the latest assessment before retrying.');
  }
  await reassessRiskAssessment(item.assessmentId, item.request, accessToken);
}

export async function syncOfficerAssessmentQueue(userId: string, accessToken: string) {
  if (!(await isOfficerAssessmentOnline())) return { synced: 0, remaining: (await listOfficerAssessmentQueue(userId)).length };
  let synced = 0;
  for (const item of await listOfficerAssessmentQueue(userId)) {
    const currentItems = await listOfficerAssessmentQueue(userId);
    const live = currentItems.find((candidate) => candidate.id === item.id);
    if (!live) continue;
    try {
      await writeQueue(userId, currentItems.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: 'SYNCING' as const, attempts: candidate.attempts + 1, lastError: null }
        : candidate));
      if (item.mode === 'INITIAL') await syncInitial(item, accessToken);
      else await syncReassessment(item, accessToken);
      await remove(userId, item.id); synced += 1;
    } catch (error) {
      await fail(userId, item, error);
      if (isNetworkError(error)) break;
      break;
    }
  }
  return { synced, remaining: (await listOfficerAssessmentQueue(userId)).length };
}

export async function saveOfficerAssessmentWithOfflineSupport(input: {
  userId: string; accessToken: string; payload: AssessmentQueuePayload;
  saveOnline: () => Promise<RiskAssessmentResponse>;
}) {
  const online = await isOfficerAssessmentOnline();
  if (!online) { await enqueueOfficerAssessment(input.userId, input.payload); return { saved: 'local' as const }; }
  try { return { saved: 'server' as const, response: await input.saveOnline() }; }
  catch (error) {
    if (!isNetworkError(error)) throw error;
    await enqueueOfficerAssessment(input.userId, input.payload);
    return { saved: 'local' as const };
  }
}
