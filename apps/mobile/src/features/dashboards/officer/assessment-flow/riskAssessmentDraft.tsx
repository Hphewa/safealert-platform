import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode
} from 'react';
import { usePathname } from 'expo-router';
import type { CalculateRiskAssessmentResponse, RiskAssessmentFactors, RiskLevel } from '@safealert/contracts';
import type { RiskAssessmentForm } from '../riskAssessmentForm';
import {
  isCalculationPreviewValid, riskAssessmentDraftReducer,
  type RiskAssessmentDraft
} from './riskAssessmentDraftState';

export type RiskAssessmentDraftContextValue = {
  draft: RiskAssessmentDraft | null;
  initializeInitialAssessment: (incidentId: string) => void;
  initializeReassessment: (input: {
    assessmentId: string; incidentId: string; factors: RiskAssessmentFactors; finalRiskLevel: RiskLevel
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

export function RiskAssessmentDraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(riskAssessmentDraftReducer, null);
  const pathname = usePathname();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const initializeInitialAssessment = useCallback((incidentId: string) =>
    dispatch({ type: 'INITIALIZE_INITIAL', incidentId }), []);
  const initializeReassessment = useCallback((input: {
    assessmentId: string; incidentId: string; factors: RiskAssessmentFactors; finalRiskLevel: RiskLevel
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
  useEffect(() => {
    if (!pathname.startsWith('/officer/assessments')) resetAssessmentDraft();
  }, [pathname, resetAssessmentDraft]);
  const value = useMemo<RiskAssessmentDraftContextValue>(() => ({
    draft,
    initializeInitialAssessment, initializeReassessment, updateFactors, updateSingleFactor,
    setCalculationPreview, clearCalculationPreview,
    calculationPreviewIsValid: isCalculationPreviewValid(draft),
    setFinalRisk, setDecisionReason, setReassessmentReason, resetAssessmentDraft
  }), [draft, initializeInitialAssessment, initializeReassessment, updateFactors, updateSingleFactor,
    setCalculationPreview, clearCalculationPreview, setFinalRisk, setDecisionReason, setReassessmentReason, resetAssessmentDraft]);

  return <RiskAssessmentDraftContext.Provider value={value}>{children}</RiskAssessmentDraftContext.Provider>;
}

export function useRiskAssessmentDraft() {
  const context = useContext(RiskAssessmentDraftContext);
  if (!context) throw new Error('useRiskAssessmentDraft must be used within RiskAssessmentDraftProvider.');
  return context;
}
