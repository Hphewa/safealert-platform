import type {
  CalculateRiskAssessmentResponse, RiskAssessmentFactors, RiskLevel
} from '@safealert/contracts';
import {
  initialRiskAssessmentForm, parseRiskAssessmentForm, riskAssessmentFormFromAssessment,
  type RiskAssessmentForm
} from '../riskAssessmentForm';

export type RiskAssessmentDraftMode = 'INITIAL' | 'REASSESSMENT';
export type RiskAssessmentCalculationPreview = {
  factors: RiskAssessmentFactors;
  result: CalculateRiskAssessmentResponse;
};
export type RiskAssessmentDraft = {
  mode: RiskAssessmentDraftMode;
  incidentId: string;
  assessmentId: string | null;
  factors: RiskAssessmentForm;
  calculationPreview: RiskAssessmentCalculationPreview | null;
  finalRiskLevel: RiskLevel;
  decisionReason: string;
  reassessmentReason: string;
};

export type RiskAssessmentDraftAction =
  | { type: 'INITIALIZE_INITIAL'; incidentId: string }
  | {
      type: 'INITIALIZE_REASSESSMENT'; assessmentId: string; incidentId: string;
      factors: RiskAssessmentFactors; finalRiskLevel: RiskLevel
    }
  | { type: 'UPDATE_FACTORS'; factors: RiskAssessmentForm }
  | { type: 'SET_CALCULATION_PREVIEW'; factors: RiskAssessmentFactors; result: CalculateRiskAssessmentResponse }
  | { type: 'CLEAR_CALCULATION_PREVIEW' }
  | { type: 'SET_FINAL_RISK'; finalRiskLevel: RiskLevel }
  | { type: 'SET_DECISION_REASON'; decisionReason: string }
  | { type: 'SET_REASSESSMENT_REASON'; reassessmentReason: string }
  | { type: 'RESET' };

export function createInitialAssessmentDraft(incidentId: string): RiskAssessmentDraft {
  return {
    mode: 'INITIAL', incidentId, assessmentId: null,
    factors: { ...initialRiskAssessmentForm }, calculationPreview: null,
    finalRiskLevel: 'LOW', decisionReason: '', reassessmentReason: ''
  };
}

export function createReassessmentDraft(input: {
  assessmentId: string;
  incidentId: string;
  factors: RiskAssessmentFactors;
  finalRiskLevel: RiskLevel;
}): RiskAssessmentDraft {
  return {
    mode: 'REASSESSMENT', incidentId: input.incidentId, assessmentId: input.assessmentId,
    factors: riskAssessmentFormFromAssessment(input.factors), calculationPreview: null,
    finalRiskLevel: input.finalRiskLevel, decisionReason: '', reassessmentReason: ''
  };
}

export function riskAssessmentDraftReducer(
  draft: RiskAssessmentDraft | null,
  action: RiskAssessmentDraftAction
): RiskAssessmentDraft | null {
  switch (action.type) {
    case 'INITIALIZE_INITIAL':
      return createInitialAssessmentDraft(action.incidentId);
    case 'INITIALIZE_REASSESSMENT':
      return createReassessmentDraft(action);
    case 'RESET':
      return null;
    case 'UPDATE_FACTORS':
      return draft ? { ...draft, factors: action.factors, calculationPreview: null } : null;
    case 'SET_CALCULATION_PREVIEW':
      return draft ? {
        ...draft,
        calculationPreview: { factors: { ...action.factors }, result: { ...action.result } }
      } : null;
    case 'CLEAR_CALCULATION_PREVIEW':
      return draft ? { ...draft, calculationPreview: null } : null;
    case 'SET_FINAL_RISK':
      return draft ? { ...draft, finalRiskLevel: action.finalRiskLevel } : null;
    case 'SET_DECISION_REASON':
      return draft ? { ...draft, decisionReason: action.decisionReason } : null;
    case 'SET_REASSESSMENT_REASON':
      return draft ? { ...draft, reassessmentReason: action.reassessmentReason } : null;
  }
}

export function isCalculationPreviewValid(draft: RiskAssessmentDraft | null): boolean {
  if (!draft?.calculationPreview) return false;
  try {
    const currentFactors = parseRiskAssessmentForm(draft.factors);
    return Object.keys(currentFactors).every((key) =>
      currentFactors[key as keyof RiskAssessmentFactors] ===
      draft.calculationPreview!.factors[key as keyof RiskAssessmentFactors]
    );
  } catch {
    return false;
  }
}
