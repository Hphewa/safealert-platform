import {
  RISK_DECISION_REASON_MAX_LENGTH, RISK_DECISION_REASON_MIN_LENGTH,
  type CreateRiskAssessmentRequest, type ReassessRiskAssessmentRequest, type RiskAssessmentFactors, type RiskLevel
} from '@safealert/contracts';
import { ApiClientError } from '../../../services/api/client';

export type RiskAssessmentForm = Omit<RiskAssessmentFactors, 'peopleAffected' | 'vulnerablePeople'> & {
  peopleAffected: string;
  vulnerablePeople: string;
};
export type RiskAssessmentFormErrors = Partial<Pick<Record<keyof RiskAssessmentForm, string>, 'peopleAffected' | 'vulnerablePeople'>>;
// Do not prefill official observations from the resident's reported severity.
export const initialRiskAssessmentForm: RiskAssessmentForm = {
  hazardSeverity: 'MODERATE', peopleAffected: '', vulnerablePeople: '',
  roadAccessibility: 'UNKNOWN', infrastructureImpact: 'NONE',
  waterLevelTrend: 'UNKNOWN', weatherCondition: 'UNKNOWN'
};
const isCount = (value: string) => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));

export function validateRiskAssessmentForm(form: RiskAssessmentForm): RiskAssessmentFormErrors {
  const errors: RiskAssessmentFormErrors = {};
  if (!isCount(form.peopleAffected)) errors.peopleAffected = 'Enter a whole number of 0 or more.';
  if (!isCount(form.vulnerablePeople)) errors.vulnerablePeople = 'Enter a whole number of 0 or more.';
  if (!errors.peopleAffected && !errors.vulnerablePeople && Number(form.vulnerablePeople) > Number(form.peopleAffected)) {
    errors.vulnerablePeople = 'Vulnerable people cannot exceed people affected.';
  }
  return errors;
}
export function parseRiskAssessmentForm(form: RiskAssessmentForm): RiskAssessmentFactors {
  const errors = validateRiskAssessmentForm(form);
  if (errors.peopleAffected) throw new Error(`People affected: ${errors.peopleAffected}`);
  if (errors.vulnerablePeople) throw new Error(`Vulnerable people: ${errors.vulnerablePeople}`);
  const peopleAffected = Number(form.peopleAffected);
  const vulnerablePeople = Number(form.vulnerablePeople);
  return { ...form, peopleAffected, vulnerablePeople };
}
export function riskAssessmentFormFromAssessment(assessment: RiskAssessmentFactors): RiskAssessmentForm {
  return {
    hazardSeverity: assessment.hazardSeverity, peopleAffected: String(assessment.peopleAffected),
    vulnerablePeople: String(assessment.vulnerablePeople), roadAccessibility: assessment.roadAccessibility,
    infrastructureImpact: assessment.infrastructureImpact, waterLevelTrend: assessment.waterLevelTrend,
    weatherCondition: assessment.weatherCondition
  };
}
export function decisionReasonError(finalRisk: RiskLevel, suggestedRisk: RiskLevel, reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0 && finalRisk === suggestedRisk) return null;
  if (length < RISK_DECISION_REASON_MIN_LENGTH) return 'Enter a decision reason of at least 10 characters.';
  if (length > RISK_DECISION_REASON_MAX_LENGTH) return 'Decision reason must be at most 500 characters.';
  return null;
}
// Keep the officer's final decision and the server's recommendation separate at
// the save boundary so a manual override cannot be replaced by preview state.
export function buildRiskAssessmentRequest(
  incidentId: string, factors: RiskAssessmentFactors, finalRisk: RiskLevel,
  suggestedRisk: RiskLevel, reason: string
): CreateRiskAssessmentRequest {
  const invalidReason = decisionReasonError(finalRisk, suggestedRisk, reason);
  if (invalidReason) throw new Error(invalidReason);
  const trimmedReason = reason.trim();
  return {
    incidentId, ...factors, finalRiskLevel: finalRisk,
    ...(trimmedReason ? { decisionReason: trimmedReason } : {})
  };
}
export function reassessmentReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length < RISK_DECISION_REASON_MIN_LENGTH) return 'Enter a reassessment reason of at least 10 characters.';
  if (length > RISK_DECISION_REASON_MAX_LENGTH) return 'Reassessment reason must be at most 500 characters.';
  return null;
}
export function buildReassessmentRiskAssessmentRequest(
  factors: RiskAssessmentFactors, finalRisk: RiskLevel, suggestedRisk: RiskLevel,
  decisionReason: string, reassessmentReason: string
): ReassessRiskAssessmentRequest {
  const invalidReassessmentReason = reassessmentReasonError(reassessmentReason);
  if (invalidReassessmentReason) throw new Error(invalidReassessmentReason);
  const invalidDecisionReason = decisionReasonError(finalRisk, suggestedRisk, decisionReason);
  if (invalidDecisionReason) throw new Error(invalidDecisionReason);
  const trimmedDecisionReason = decisionReason.trim();
  return {
    ...factors, finalRiskLevel: finalRisk,
    ...(trimmedDecisionReason ? { decisionReason: trimmedDecisionReason } : {}),
    reassessmentReason: reassessmentReason.trim()
  };
}
export function assessmentErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.code === 'ASSESSMENT_NOT_ACTIVE') {
    return 'This assessment is no longer active. Refresh to view the latest assessment.';
  }
  return error instanceof Error ? error.message : 'Unable to complete this request. Please try again.';
}
export function warningPublishErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/WARNING_NOT_FOUND/i.test(error.message)) return 'Warning not found.';
    if (/WARNING_NOT_DRAFT/i.test(error.message)) return 'This warning has already been published.';
    if (/AFFECTED_AREA_REQUIRED/i.test(error.message)) return 'Affected area is required.';
    if (/FORBIDDEN|not authorized/i.test(error.message)) return 'You are not authorized to publish warnings.';
    return error.message;
  }
  return 'Unable to publish this warning. Please try again.';
}
