import { describe, expect, it } from 'vitest';
import type { RiskAssessmentFactors } from '@safealert/contracts';
import {
  createInitialAssessmentDraft,
  createReassessmentDraft,
  isCalculationPreviewValid,
  riskAssessmentDraftReducer
} from './riskAssessmentDraftState';
import type { RiskAssessmentDraft } from './riskAssessmentDraftState';

const factors: RiskAssessmentFactors = {
  hazardSeverity: 'HIGH', peopleAffected: 18, vulnerablePeople: 6,
  roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
  waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN'
};

describe('risk assessment draft state', () => {
  it('initializes a new assessment with the existing form defaults and no preview', () => {
    const draft = createInitialAssessmentDraft('incident-1');

    expect(draft).toMatchObject({
      mode: 'INITIAL', incidentId: 'incident-1', assessmentId: null,
      factors: { hazardSeverity: 'MODERATE', peopleAffected: '', vulnerablePeople: '',
        roadAccessibility: 'UNKNOWN', infrastructureImpact: 'NONE', waterLevelTrend: 'UNKNOWN', weatherCondition: 'UNKNOWN' },
      calculationPreview: null, finalRiskLevel: 'LOW', decisionReason: '', reassessmentReason: ''
    });
  });

  it('prefills reassessment values without treating the saved assessment as a new preview', () => {
    const draft = createReassessmentDraft({ assessmentId: 'assessment-1', incidentId: 'incident-1', factors, finalRiskLevel: 'HIGH' });

    expect(draft).toMatchObject({
      mode: 'REASSESSMENT', assessmentId: 'assessment-1', incidentId: 'incident-1',
      factors: { ...factors, peopleAffected: '18', vulnerablePeople: '6' },
      calculationPreview: null, finalRiskLevel: 'HIGH', reassessmentReason: ''
    });
  });

  it('marks a preview valid only for the exact factor values used to calculate it', () => {
    let draft: RiskAssessmentDraft | null = createInitialAssessmentDraft('incident-1');
    draft = { ...draft, factors: {
      ...draft.factors, hazardSeverity: factors.hazardSeverity, peopleAffected: '18', vulnerablePeople: '6',
      roadAccessibility: factors.roadAccessibility, infrastructureImpact: factors.infrastructureImpact,
      waterLevelTrend: factors.waterLevelTrend, weatherCondition: factors.weatherCondition
    } };
    const withPreview = riskAssessmentDraftReducer(draft, {
      type: 'SET_CALCULATION_PREVIEW', factors,
      result: { calculatedScore: 18, systemSuggestedRisk: 'HIGH' }
    });
    if (!withPreview) throw new Error('Expected an initialized assessment draft.');

    expect(isCalculationPreviewValid(withPreview)).toBe(true);
    const edited = riskAssessmentDraftReducer(withPreview, {
      type: 'UPDATE_FACTORS', factors: { ...withPreview.factors, peopleAffected: '19' }
    });
    expect(edited).toMatchObject({ calculationPreview: null });
    expect(isCalculationPreviewValid(edited)).toBe(false);
  });

  it('clears calculation preview when the preview is explicitly cleared and resets the draft', () => {
    let draft: RiskAssessmentDraft | null = createInitialAssessmentDraft('incident-1');
    draft = { ...draft, factors: {
      ...draft.factors, hazardSeverity: factors.hazardSeverity, peopleAffected: '18', vulnerablePeople: '6',
      roadAccessibility: factors.roadAccessibility, infrastructureImpact: factors.infrastructureImpact,
      waterLevelTrend: factors.waterLevelTrend, weatherCondition: factors.weatherCondition
    } };
    draft = riskAssessmentDraftReducer(draft, {
      type: 'SET_CALCULATION_PREVIEW', factors,
      result: { calculatedScore: 18, systemSuggestedRisk: 'HIGH' }
    });
    expect(riskAssessmentDraftReducer(draft, { type: 'CLEAR_CALCULATION_PREVIEW' })?.calculationPreview).toBeNull();
    expect(riskAssessmentDraftReducer(draft, { type: 'RESET' })).toBeNull();
  });

  it('keeps final decision and reason fields in the shared draft', () => {
    const draft = createReassessmentDraft({ assessmentId: 'assessment-1', incidentId: 'incident-1', factors, finalRiskLevel: 'HIGH' });
    const updated = riskAssessmentDraftReducer(draft, { type: 'SET_FINAL_RISK', finalRiskLevel: 'CRITICAL' });
    const withDecisionReason = riskAssessmentDraftReducer(updated, {
      type: 'SET_DECISION_REASON', decisionReason: 'Conditions worsened.'
    });
    const withReassessmentReason = riskAssessmentDraftReducer(withDecisionReason, {
      type: 'SET_REASSESSMENT_REASON', reassessmentReason: 'Water levels are rising quickly.'
    });

    expect(withReassessmentReason).toMatchObject({
      finalRiskLevel: 'CRITICAL', decisionReason: 'Conditions worsened.',
      reassessmentReason: 'Water levels are rising quickly.'
    });
  });
});
