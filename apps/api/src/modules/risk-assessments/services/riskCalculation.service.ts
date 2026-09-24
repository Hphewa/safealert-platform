import type { HazardType, RiskAssessmentFactors, RiskLevel } from '@safealert/contracts';

// University-project heuristic, NOT an official government disaster-risk formula.
// Unknown observations carry uncertainty points rather than implying safe conditions.
const severityPoints = { LOW: 0, MODERATE: 3, HIGH: 6, SEVERE: 9 } as const;
const roadPoints = { ACCESSIBLE: 0, PARTIALLY_BLOCKED: 2, FULLY_BLOCKED: 4, UNKNOWN: 1 } as const;
const infrastructurePoints = { NONE: 0, LOW: 1, MODERATE: 3, HIGH: 5, SEVERE: 7 } as const;
const waterPoints = { FALLING: 0, STABLE: 0, RISING: 3, RISING_RAPIDLY: 6, NOT_APPLICABLE: 0, UNKNOWN: 1 } as const;
const weatherPoints = { CLEAR: 0, LIGHT_RAIN: 1, MODERATE_RAIN: 2, HEAVY_RAIN: 4, STORM: 6, UNKNOWN: 1 } as const;

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 24) return 'CRITICAL';
  if (score >= 16) return 'HIGH';
  if (score >= 8) return 'MODERATE';
  return 'LOW';
}
export function calculateRisk(factors: RiskAssessmentFactors, hazardType: HazardType) {
  const peoplePoints = factors.peopleAffected === 0 ? 0
    : factors.peopleAffected <= 10 ? 1 : factors.peopleAffected <= 50 ? 2
      : factors.peopleAffected <= 100 ? 3 : factors.peopleAffected <= 500 ? 4 : 5;
  const vulnerablePoints = factors.vulnerablePeople === 0 ? 0
    : factors.vulnerablePeople <= 5 ? 1 : factors.vulnerablePeople <= 20 ? 2 : 4;
  const score = severityPoints[factors.hazardSeverity] + peoplePoints + vulnerablePoints
    + roadPoints[factors.roadAccessibility] + infrastructurePoints[factors.infrastructureImpact]
    + (hazardType === 'FLOOD' ? waterPoints[factors.waterLevelTrend] : 0)
    + weatherPoints[factors.weatherCondition];
  return { score, suggestedRisk: riskLevelForScore(score) };
}
