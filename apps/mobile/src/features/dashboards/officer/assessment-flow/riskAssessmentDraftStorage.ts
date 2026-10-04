import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, RISK_LEVELS,
  ROAD_ACCESSIBILITY_OPTIONS, WATER_LEVEL_TRENDS, WEATHER_CONDITIONS
} from '@safealert/contracts';
import type { RiskAssessmentDraft, RiskAssessmentDraftMode } from './riskAssessmentDraftState';
import type { RiskAssessmentForm } from '../riskAssessmentForm';

const STORAGE_PREFIX = 'safealert:assessment-draft:v1:';
const STORAGE_VERSION = 1;

export type StoredRiskAssessmentDraft = Omit<RiskAssessmentDraft, 'calculationPreview' | 'previousAssessment'> & {
  calculationPreview: null;
  updatedAt: string;
};
type PersistedRiskAssessmentDraft = {
  version: typeof STORAGE_VERSION;
  mode: RiskAssessmentDraftMode;
  incidentId: string;
  assessmentId: string | null;
  factors: RiskAssessmentForm;
  finalRiskLevel: RiskAssessmentDraft['finalRiskLevel'];
  decisionReason: string;
  reassessmentReason: string;
  updatedAt: string;
};

const queuedMutations = new Map<string, Promise<void>>();
const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

function scheduleMutation(userId: string, mutation: () => Promise<void>): Promise<void> {
  const previous = queuedMutations.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutation).catch(() => undefined);
  queuedMutations.set(userId, current);
  return current.finally(() => {
    if (queuedMutations.get(userId) === current) queuedMutations.delete(userId);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredDraft(value: unknown): StoredRiskAssessmentDraft | null {
  if (!isRecord(value) || value.version !== STORAGE_VERSION ||
    (value.mode !== 'INITIAL' && value.mode !== 'REASSESSMENT') ||
    typeof value.incidentId !== 'string' || !value.incidentId.trim() ||
    !(value.assessmentId === null || (typeof value.assessmentId === 'string' && value.assessmentId.trim())) ||
    !isRecord(value.factors) || !RISK_LEVELS.includes(value.finalRiskLevel as (typeof RISK_LEVELS)[number]) ||
    typeof value.decisionReason !== 'string' || typeof value.reassessmentReason !== 'string' ||
    typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;

  const factors = value.factors;
  const validFactors = HAZARD_ASSESSMENT_SEVERITIES.includes(factors.hazardSeverity as (typeof HAZARD_ASSESSMENT_SEVERITIES)[number]) &&
    typeof factors.peopleAffected === 'string' && typeof factors.vulnerablePeople === 'string' &&
    ROAD_ACCESSIBILITY_OPTIONS.includes(factors.roadAccessibility as (typeof ROAD_ACCESSIBILITY_OPTIONS)[number]) &&
    INFRASTRUCTURE_IMPACT_LEVELS.includes(factors.infrastructureImpact as (typeof INFRASTRUCTURE_IMPACT_LEVELS)[number]) &&
    WATER_LEVEL_TRENDS.includes(factors.waterLevelTrend as (typeof WATER_LEVEL_TRENDS)[number]) &&
    WEATHER_CONDITIONS.includes(factors.weatherCondition as (typeof WEATHER_CONDITIONS)[number]);
  if (!validFactors) return null;
  if ((value.mode === 'INITIAL' && value.assessmentId !== null) ||
    (value.mode === 'REASSESSMENT' && typeof value.assessmentId !== 'string')) return null;

  return {
    mode: value.mode,
    incidentId: value.incidentId,
    assessmentId: value.assessmentId,
    factors: { ...factors } as RiskAssessmentForm,
    calculationPreview: null,
    finalRiskLevel: value.finalRiskLevel as RiskAssessmentDraft['finalRiskLevel'],
    decisionReason: value.decisionReason,
    reassessmentReason: value.reassessmentReason,
    updatedAt: value.updatedAt
  };
}

export async function readDraft(userId: string): Promise<StoredRiskAssessmentDraft | null> {
  if (!userId) return null;
  await (queuedMutations.get(userId) ?? Promise.resolve());
  try {
    const value = await AsyncStorage.getItem(storageKey(userId));
    if (value === null) return null;
    return parseStoredDraft(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export async function writeDraft(userId: string, draft: RiskAssessmentDraft, now = new Date()): Promise<void> {
  if (!userId) return;
  const payload: PersistedRiskAssessmentDraft = {
    version: STORAGE_VERSION,
    mode: draft.mode,
    incidentId: draft.incidentId,
    assessmentId: draft.assessmentId,
    factors: { ...draft.factors },
    finalRiskLevel: draft.finalRiskLevel,
    decisionReason: draft.decisionReason,
    reassessmentReason: draft.reassessmentReason,
    updatedAt: now.toISOString()
  };
  await scheduleMutation(userId, async () => {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload));
  });
}

export async function clearDraft(userId: string): Promise<void> {
  if (!userId) return;
  await scheduleMutation(userId, async () => { await AsyncStorage.removeItem(storageKey(userId)); });
}

export async function clearDraftForUserChange(previousUserId: string | null, nextUserId: string | null): Promise<void> {
  if (previousUserId && previousUserId !== nextUserId) await clearDraft(previousUserId);
}
