import { describe, expect, it } from 'vitest';
import { RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS } from '@safealert/contracts';
import { closeRiskAssessmentSchema, reassessRiskAssessmentSchema } from '../validation/riskAssessment.schemas.js';

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

describe('closeRiskAssessmentSchema', () => {
  it.each(['INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED'])(
    'accepts predefined manual reason %s without a note', (closureReason) => {
      expect(closeRiskAssessmentSchema.parse({ closureReason })).toEqual({ closureReason });
    });

  it('exposes the four manual reasons through the shared contract', () => {
    expect(RISK_ASSESSMENT_MANUAL_CLOSURE_REASONS).toEqual([
      'INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED', 'OTHER'
    ]);
  });

  it('accepts OTHER with a trimmed note', () => {
    expect(closeRiskAssessmentSchema.parse({ closureReason: 'OTHER', closureNote: '  Situation resolved after review.  ' }))
      .toEqual({ closureReason: 'OTHER', closureNote: 'Situation resolved after review.' });
  });

  it.each(['REASSESSED', 'UNKNOWN'])('rejects non-manual reason %s', (closureReason) => {
    expect(closeRiskAssessmentSchema.safeParse({ closureReason }).success).toBe(false);
  });

  it.each(['status', 'closedAt', 'closedById', 'unexpected'])('rejects field %s', (field) => {
    expect(closeRiskAssessmentSchema.safeParse({ closureReason: 'INCIDENT_RESOLVED', [field]: 'forged' }).success)
      .toBe(false);
  });

  it.each(['', '          ', 'too short', 'x'.repeat(501)])('rejects invalid supplied note %j', (closureNote) => {
    expect(closeRiskAssessmentSchema.safeParse({ closureReason: 'INCIDENT_RESOLVED', closureNote }).success)
      .toBe(false);
  });

  it('requires a note for OTHER', () => {
    expect(closeRiskAssessmentSchema.safeParse({ closureReason: 'OTHER' }).success).toBe(false);
  });

  it('accepts notes at the 10 and 500 character limits after trimming', () => {
    for (const length of [10, 500]) {
      expect(closeRiskAssessmentSchema.parse({ closureReason: 'OTHER', closureNote: ` ${'x'.repeat(length)} ` }).closureNote)
        .toHaveLength(length);
    }
  });
});
