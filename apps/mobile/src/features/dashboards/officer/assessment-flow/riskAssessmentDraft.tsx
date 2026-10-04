import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode
} from 'react';
import { usePathname, useRouter } from 'expo-router';
import type { CalculateRiskAssessmentResponse, RiskAssessmentFactors, RiskLevel, SafeRiskAssessment } from '@safealert/contracts';
import type { RiskAssessmentForm } from '../riskAssessmentForm';
import { useAuth } from '../../../auth/hooks/useAuth';
import { loadIncidentOverview } from '../api/incidentOverview';
import { getRiskAssessment } from '../api/riskAssessmentApi';
import { AssessmentDraftRecovery } from '../components/AssessmentDraftRecovery';
import { clearDraft, clearDraftForUserChange, readDraft, writeDraft, type StoredRiskAssessmentDraft } from './riskAssessmentDraftStorage';
import {
  isCalculationPreviewValid, isRiskAssessmentDraftDirty, riskAssessmentDraftReducer,
  type RiskAssessmentDraft
} from './riskAssessmentDraftState';

export type RiskAssessmentDraftContextValue = {
  draft: RiskAssessmentDraft | null;
  isDirty: boolean;
  recoveryDraft: StoredRiskAssessmentDraft | null;
  recoveryLoading: boolean;
  recoveryBusy: boolean;
  recoveryError: string | null;
  continueRecoveredDraft: () => Promise<void>;
  startAgain: () => Promise<void>;
  discardAssessmentDraft: () => Promise<void>;
  initializeInitialAssessment: (incidentId: string) => void;
  initializeReassessment: (input: {
    assessmentId: string; incidentId: string; factors: RiskAssessmentFactors; finalRiskLevel: RiskLevel; previousAssessment?: SafeRiskAssessment
  }) => void;
  updateFactors: (factors: RiskAssessmentForm) => void;
  updateSingleFactor: <K extends keyof RiskAssessmentForm>(field: K, value: RiskAssessmentForm[K]) => void;
  setCalculationPreview: (factors: RiskAssessmentFactors, result: CalculateRiskAssessmentResponse) => void;
  clearCalculationPreview: () => void;
  calculationPreviewIsValid: boolean;
  setFinalRisk: (finalRiskLevel: RiskLevel) => void;
  setDecisionReason: (decisionReason: string) => void;
  setReassessmentReason: (reassessmentReason: string) => void;
  resetAssessmentDraft: () => void;
};

const RiskAssessmentDraftContext = createContext<RiskAssessmentDraftContextValue | null>(null);

function editableDraft(saved: StoredRiskAssessmentDraft) {
  return {
    mode: saved.mode, incidentId: saved.incidentId, assessmentId: saved.assessmentId,
    factors: { ...saved.factors }, finalRiskLevel: saved.finalRiskLevel,
    decisionReason: saved.decisionReason, reassessmentReason: saved.reassessmentReason
  };
}

export function RiskAssessmentDraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(riskAssessmentDraftReducer, null);
  const { status: authStatus, user, accessToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [recoveryDraft, setRecoveryDraft] = useState<StoredRiskAssessmentDraft | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(true);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const hydrationGeneration = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const initializeInitialAssessment = useCallback((incidentId: string) =>
    dispatch({ type: 'INITIALIZE_INITIAL', incidentId }), []);
  const initializeReassessment = useCallback((input: {
    assessmentId: string; incidentId: string; factors: RiskAssessmentFactors; finalRiskLevel: RiskLevel; previousAssessment?: SafeRiskAssessment
  }) => dispatch({ type: 'INITIALIZE_REASSESSMENT', ...input }), []);
  const updateFactors = useCallback((factors: RiskAssessmentForm) =>
    dispatch({ type: 'UPDATE_FACTORS', factors }), []);
  const updateSingleFactor = useCallback(<K extends keyof RiskAssessmentForm>(field: K, value: RiskAssessmentForm[K]) => {
    const current = draftRef.current;
    if (current) dispatch({ type: 'UPDATE_FACTORS', factors: { ...current.factors, [field]: value } });
  }, []);
  const setCalculationPreview = useCallback((factors: RiskAssessmentFactors, result: CalculateRiskAssessmentResponse) =>
    dispatch({ type: 'SET_CALCULATION_PREVIEW', factors, result }), []);
  const clearCalculationPreview = useCallback(() => dispatch({ type: 'CLEAR_CALCULATION_PREVIEW' }), []);
  const setFinalRisk = useCallback((finalRiskLevel: RiskLevel) => dispatch({ type: 'SET_FINAL_RISK', finalRiskLevel }), []);
  const setDecisionReason = useCallback((decisionReason: string) => dispatch({ type: 'SET_DECISION_REASON', decisionReason }), []);
  const setReassessmentReason = useCallback((reassessmentReason: string) => dispatch({ type: 'SET_REASSESSMENT_REASON', reassessmentReason }), []);
  const resetAssessmentDraft = useCallback(() => dispatch({ type: 'RESET' }), []);
  const discardAssessmentDraft = useCallback(async () => {
    if (activeUserId.current) await clearDraft(activeUserId.current);
    setRecoveryDraft(null); setRecoveryError(null); dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => {
    const generation = ++hydrationGeneration.current;
    if (authStatus === 'loading') { setRecoveryLoading(true); return; }
    const userId = authStatus === 'authenticated' ? user?.id ?? null : null;
    const previousUserId = activeUserId.current;
    activeUserId.current = userId;
    dispatch({ type: 'RESET' }); setRecoveryDraft(null); setRecoveryError(null);
    if (previousUserId && previousUserId !== userId) void clearDraftForUserChange(previousUserId, userId);
    if (!userId) { setRecoveryLoading(false); return; }
    setRecoveryLoading(true);
    void readDraft(userId).then((stored) => {
      if (hydrationGeneration.current !== generation || activeUserId.current !== userId) return;
      setRecoveryDraft(stored);
    }).finally(() => {
      if (hydrationGeneration.current === generation && activeUserId.current === userId) setRecoveryLoading(false);
    });
    return () => { hydrationGeneration.current += 1; };
  }, [authStatus, user?.id]);

  const continueRecoveredDraft = useCallback(async () => {
    const saved = recoveryDraft;
    const userId = activeUserId.current;
    if (!saved || !userId || !accessToken || recoveryBusy) return;
    setRecoveryBusy(true); setRecoveryError(null);
    try {
      if (saved.mode === 'INITIAL') {
        const latest = await loadIncidentOverview(saved.incidentId, accessToken);
        if (!latest.canStartInitialAssessment || latest.incident.id !== saved.incidentId) {
          await discardAssessmentDraft();
          router.replace(latest.assessment
            ? { pathname: '/officer/monitoring/[incidentId]', params: { incidentId: saved.incidentId } }
            : { pathname: '/officer/assessments/incident/[incidentId]', params: { incidentId: saved.incidentId } });
          return;
        }
        dispatch({ type: 'RESTORE_DRAFT', draft: editableDraft(saved) });
        setRecoveryDraft(null);
        router.replace({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'situation', incidentId: saved.incidentId } });
      } else {
        const assessmentId = saved.assessmentId;
        if (!assessmentId) throw new Error('The saved reassessment reference is incomplete. Start again to continue.');
        const latest = await getRiskAssessment(assessmentId, accessToken);
        if (latest.assessment.id !== assessmentId || latest.assessment.status !== 'ACTIVE' || latest.assessment.incidentId !== saved.incidentId) {
          await discardAssessmentDraft();
          router.replace({ pathname: '/officer/monitoring/[incidentId]', params: { incidentId: saved.incidentId } });
          return;
        }
        dispatch({ type: 'RESTORE_DRAFT', draft: editableDraft(saved), previousAssessment: latest.assessment });
        setRecoveryDraft(null);
        router.replace({ pathname: '/officer/assessments/reassess/[step]', params: { step: 'reason', assessmentId } });
      }
    } catch (failure) {
      setRecoveryError(failure instanceof Error ? failure.message : 'Saved assessment could not be checked. Try again.');
    } finally { setRecoveryBusy(false); }
  }, [accessToken, discardAssessmentDraft, recoveryBusy, recoveryDraft, router]);

  const startAgain = useCallback(async () => {
    const saved = recoveryDraft;
    await discardAssessmentDraft();
    if (!saved) return;
    router.replace(saved.mode === 'INITIAL' ? '/officer/assessments' : {
      pathname: '/officer/monitoring/[incidentId]', params: { incidentId: saved.incidentId }
    });
  }, [discardAssessmentDraft, recoveryDraft, router]);

  const isDirty = isRiskAssessmentDraftDirty(draft);
  useEffect(() => {
    const userId = activeUserId.current;
    if (!userId || authStatus !== 'authenticated' || recoveryLoading || recoveryDraft) return;
    if (draft && isRiskAssessmentDraftDirty(draft)) void writeDraft(userId, draft);
    else void clearDraft(userId);
  }, [authStatus, draft, recoveryDraft, recoveryLoading]);

  useEffect(() => {
    if (!pathname.startsWith('/officer/assessments')) resetAssessmentDraft();
  }, [pathname, resetAssessmentDraft]);
  const value = useMemo<RiskAssessmentDraftContextValue>(() => ({
    draft, isDirty, recoveryDraft, recoveryLoading, recoveryBusy, recoveryError,
    continueRecoveredDraft, startAgain, discardAssessmentDraft,
    initializeInitialAssessment, initializeReassessment, updateFactors, updateSingleFactor,
    setCalculationPreview, clearCalculationPreview,
    calculationPreviewIsValid: isCalculationPreviewValid(draft),
    setFinalRisk, setDecisionReason, setReassessmentReason, resetAssessmentDraft
  }), [draft, isDirty, recoveryDraft, recoveryLoading, recoveryBusy, recoveryError, continueRecoveredDraft,
    startAgain, discardAssessmentDraft, initializeInitialAssessment, initializeReassessment, updateFactors, updateSingleFactor,
    setCalculationPreview, clearCalculationPreview, setFinalRisk, setDecisionReason, setReassessmentReason, resetAssessmentDraft]);

  return <RiskAssessmentDraftContext.Provider value={value}>
    {children}
    {authStatus === 'authenticated' ? <AssessmentDraftRecovery loading={recoveryLoading} draft={recoveryDraft}
      busy={recoveryBusy} error={recoveryError} onContinue={() => void continueRecoveredDraft()} onStartAgain={() => void startAgain()} /> : null}
  </RiskAssessmentDraftContext.Provider>;
}

export function useRiskAssessmentDraft() {
  const context = useContext(RiskAssessmentDraftContext);
  if (!context) throw new Error('useRiskAssessmentDraft must be used within RiskAssessmentDraftProvider.');
  return context;
}
