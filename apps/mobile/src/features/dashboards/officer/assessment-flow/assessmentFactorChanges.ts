import type { RiskAssessmentFactors } from '@safealert/contracts';

const factorLabels: Record<keyof RiskAssessmentFactors, string> = {
  hazardSeverity: 'Hazard severity',
  peopleAffected: 'People affected',
  vulnerablePeople: 'Vulnerable people',
  roadAccessibility: 'Road accessibility',
  infrastructureImpact: 'Infrastructure impact',
  waterLevelTrend: 'Water level trend',
  weatherCondition: 'Weather condition'
};

export type AssessmentFactorChange = {
  [K in keyof RiskAssessmentFactors]: {
    key: K;
    label: string;
    previousValue: RiskAssessmentFactors[K];
    nextValue: RiskAssessmentFactors[K];
    numericDelta: RiskAssessmentFactors[K] extends number ? number : null;
  }
}[keyof RiskAssessmentFactors];

export function assessmentFactorChanges(
  previous: RiskAssessmentFactors,
  next: RiskAssessmentFactors
): AssessmentFactorChange[] {
  const changes: AssessmentFactorChange[] = [];
  (Object.keys(factorLabels) as (keyof RiskAssessmentFactors)[]).forEach((key) => {
    if (previous[key] === next[key]) return;
    const change = {
      key,
      label: factorLabels[key],
      previousValue: previous[key],
      nextValue: next[key],
      numericDelta: typeof previous[key] === 'number' && typeof next[key] === 'number'
        ? next[key] - previous[key]
        : null
    } as AssessmentFactorChange;
    changes.push(change);
  });
  return changes;
}
