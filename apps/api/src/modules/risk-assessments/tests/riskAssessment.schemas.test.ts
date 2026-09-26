import { describe, expect, it } from 'vitest';
import { reassessRiskAssessmentSchema } from '../validation/riskAssessment.schemas.js';

const validFactorsDecision = {
  hazardSeverity: 'HIGH', peopleAffected: 8, vulnerablePeople: 2,
  roadAccessibility: 'ACCESSIBLE', infrastructureImpact: 'LOW',
  waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', finalRiskLevel: 'HIGH'
};
const validRequest = { ...validFactorsDecision, reassessmentReason: 'Water levels are rising quickly.' };

describe('reassessRiskAssessmentSchema', () => {
  it('trims the reassessment and decision reasons', () => {
    expect(reassessRiskAssessmentSchema.parse({
      ...validRequest, reassessmentReason: '  Conditions have changed substantially.  ',
      decisionReason: '  Hospital access is threatened.  '
    })).toMatchObject({
      reassessmentReason: 'Conditions have changed substantially.',
      decisionReason: 'Hospital access is threatened.'
    });
  });

  it('requires a reassessment reason', () => {
    expect(reassessRiskAssessmentSchema.safeParse(validFactorsDecision).success).toBe(false);
  });

  it.each([
    { reassessmentReason: '          ' },
    { reassessmentReason: 'short' },
    { reassessmentReason: 'x'.repeat(501) }
  ])('requires a meaningful reassessment reason: %j', (override) => {
    expect(reassessRiskAssessmentSchema.safeParse({ ...validRequest, ...override }).success).toBe(false);
  });

  it('rejects invalid factors and vulnerable counts greater than affected counts', () => {
    expect(reassessRiskAssessmentSchema.safeParse({ ...validRequest, vulnerablePeople: 9 }).success).toBe(false);
    expect(reassessRiskAssessmentSchema.safeParse({ ...validRequest, hazardSeverity: 'EXTREME' }).success).toBe(false);
  });

  it('accepts an optional decision reason for service validation', () => {
    expect(reassessRiskAssessmentSchema.safeParse(validRequest).success).toBe(true);
    expect(reassessRiskAssessmentSchema.safeParse({
      ...validRequest, decisionReason: 'A clear reason for the selected risk.'
    }).success).toBe(true);
  });

  it.each(['incidentId', 'calculatedScore', 'systemSuggestedRisk', 'assessedById', 'status', 'assessedAt', 'closedAt', 'closedById'])('rejects client-owned field %s', (field) => {
      expect(reassessRiskAssessmentSchema.safeParse({ ...validRequest, [field]: 'forged' }).success).toBe(false);
    });
});
