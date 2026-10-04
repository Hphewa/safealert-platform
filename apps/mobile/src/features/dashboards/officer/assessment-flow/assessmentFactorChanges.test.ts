import { describe, expect, it } from 'vitest';
import type { RiskAssessmentFactors } from '@safealert/contracts';
import { assessmentFactorChanges } from './assessmentFactorChanges';

const previous: RiskAssessmentFactors = {
  hazardSeverity: 'MODERATE', peopleAffected: 20, vulnerablePeople: 5,
  roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW', waterLevelTrend: 'STABLE',
  weatherCondition: 'CLEAR'
};

describe('assessmentFactorChanges', () => {
  it('returns no changes for equivalent factors and does not mutate its inputs', () => {
    const before = structuredClone(previous);
    expect(assessmentFactorChanges(previous, { ...previous })).toEqual([]);
    expect(previous).toEqual(before);
  });

  it('returns only changed values with numeric population deltas', () => {
    const next: RiskAssessmentFactors = { ...previous, peopleAffected: 33, roadAccessibility: 'PARTIALLY_BLOCKED' };
    expect(assessmentFactorChanges(previous, next)).toEqual([
      { key: 'peopleAffected', label: 'People affected', previousValue: 20, nextValue: 33, numericDelta: 13 },
      { key: 'roadAccessibility', label: 'Road accessibility', previousValue: 'ACCESSIBLE', nextValue: 'PARTIALLY_BLOCKED', numericDelta: null }
    ]);
  });
});
