import {
  RISK_DECISION_REASON_MAX_LENGTH, RISK_DECISION_REASON_MIN_LENGTH,
  type RiskAssessmentFactors, type RiskLevel
} from '@safealert/contracts';

export type RiskAssessmentForm = Omit<RiskAssessmentFactors, 'peopleAffected' | 'vulnerablePeople'> & {
  peopleAffected: string;
  vulnerablePeople: string;
};
// Do not prefill official observations from the resident's reported severity.
export const initialRiskAssessmentForm: RiskAssessmentForm = {
  hazardSeverity: 'MODERATE', peopleAffected: '', vulnerablePeople: '',
  roadAccessibility: 'UNKNOWN', infrastructureImpact: 'NONE',
  waterLevelTrend: 'UNKNOWN', weatherCondition: 'UNKNOWN'
};
export function parseRiskAssessmentForm(form: RiskAssessmentForm): RiskAssessmentFactors {
  const parseCount = (value: string, label: string) => {
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
      throw new Error(`${label} must be a whole number of 0 or more.`);
    }
    return Number(value);
  };
  const peopleAffected = parseCount(form.peopleAffected, 'People affected');
  const vulnerablePeople = parseCount(form.vulnerablePeople, 'Vulnerable people');
  if (vulnerablePeople > peopleAffected) throw new Error('Vulnerable people cannot exceed people affected.');
  return { ...form, peopleAffected, vulnerablePeople };
}
export function decisionReasonError(finalRisk: RiskLevel, suggestedRisk: RiskLevel, reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0 && finalRisk === suggestedRisk) return null;
  if (length < RISK_DECISION_REASON_MIN_LENGTH) return 'Enter a decision reason of at least 10 characters.';
  if (length > RISK_DECISION_REASON_MAX_LENGTH) return 'Decision reason must be at most 500 characters.';
  return null;
}
export function assessmentErrorMessage(error: unknown) {
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
