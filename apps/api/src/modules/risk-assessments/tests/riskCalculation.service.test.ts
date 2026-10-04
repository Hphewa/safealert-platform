import type { RiskAssessmentFactors } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';
import { calculateRisk, riskLevelForScore } from '../services/riskCalculation.service.js';

const baseline: RiskAssessmentFactors = {
  hazardSeverity: 'LOW', peopleAffected: 0, vulnerablePeople: 0, roadAccessibility: 'ACCESSIBLE',
  infrastructureImpact: 'NONE', waterLevelTrend: 'STABLE', weatherCondition: 'CLEAR'
};
describe('rule-based risk calculation', () => {
  it.each([[0, 'LOW'], [7, 'LOW'], [8, 'MODERATE'], [15, 'MODERATE'], [16, 'HIGH'], [23, 'HIGH'], [24, 'CRITICAL'], [41, 'CRITICAL']] as const)('maps boundary score %i to %s', (score, level) => {
    expect(riskLevelForScore(score)).toBe(level);
  });
  it('is deterministic at minimum and maximum factors', () => {
    expect(calculateRisk(baseline, 'FLOOD')).toMatchObject({ score: 0, suggestedRisk: 'LOW' });
    const maximum: RiskAssessmentFactors = {
      hazardSeverity: 'SEVERE', peopleAffected: 501, vulnerablePeople: 21,
      roadAccessibility: 'FULLY_BLOCKED', infrastructureImpact: 'SEVERE',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'STORM'
    };
    expect(calculateRisk(maximum, 'FLOOD')).toMatchObject({ score: 41, suggestedRisk: 'CRITICAL' });
    expect(calculateRisk(maximum, 'FLOOD')).toEqual(calculateRisk(maximum, 'FLOOD'));
  });
  it.each([[0, 0], [1, 1], [10, 1], [11, 2], [50, 2], [51, 3], [100, 3], [101, 4], [500, 4], [501, 5]])('scores %i affected people as %i', (peopleAffected, score) => {
    expect(calculateRisk({ ...baseline, peopleAffected }, 'FLOOD').score).toBe(score);
  });
  it.each([[0, 0], [1, 1], [5, 1], [6, 2], [20, 2], [21, 4]])('adds points for %i vulnerable people', (vulnerablePeople, points) => {
    expect(calculateRisk({ ...baseline, peopleAffected: 100, vulnerablePeople }, 'FLOOD').score).toBe(3 + points);
  });
  it('applies rising-water points only to the authoritative flood hazard', () => {
    const input = { ...baseline, waterLevelTrend: 'RISING_RAPIDLY' as const };
    expect(calculateRisk(input, 'FLOOD').score).toBe(6);
    expect(calculateRisk(input, 'BLOCKED_ROAD').score).toBe(0);
    expect(calculateRisk(input, 'LANDSLIDE').score).toBe(0);
  });
  it('treats unknown observations as uncertainty', () => {
    expect(calculateRisk({ ...baseline, roadAccessibility: 'UNKNOWN', waterLevelTrend: 'UNKNOWN', weatherCondition: 'UNKNOWN' }, 'FLOOD').score).toBe(3);
  });
  it('returns named authoritative contribution entries whose points sum to the calculated score', () => {
    const result = calculateRisk({ ...baseline, hazardSeverity: 'HIGH', peopleAffected: 11,
      vulnerablePeople: 6, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'HEAVY_RAIN' }, 'FLOOD');
    expect(result.factorContributions).toEqual([
      { key: 'hazardSeverity', label: 'Hazard severity', selectedValue: 'HIGH', points: 6 },
      { key: 'peopleAffected', label: 'People affected', selectedValue: 11, points: 2 },
      { key: 'vulnerablePeople', label: 'Vulnerable people', selectedValue: 6, points: 2 },
      { key: 'roadAccessibility', label: 'Road accessibility', selectedValue: 'PARTIALLY_BLOCKED', points: 2 },
      { key: 'infrastructureImpact', label: 'Infrastructure impact', selectedValue: 'MODERATE', points: 3 },
      { key: 'waterLevelTrend', label: 'Water level trend', selectedValue: 'RISING_RAPIDLY', points: 6 },
      { key: 'weatherCondition', label: 'Weather condition', selectedValue: 'HEAVY_RAIN', points: 4 }
    ]);
    expect(result.factorContributions.reduce((sum, entry) => sum + entry.points, 0)).toBe(result.score);
    expect(result.calculationVersion).toBe('risk-v1');
  });
  it('omits non-scoring water data from non-flood contribution snapshots', () => {
    const result = calculateRisk({ ...baseline, waterLevelTrend: 'RISING_RAPIDLY' }, 'LANDSLIDE');
    expect(result.factorContributions.some(({ key }) => key === 'waterLevelTrend')).toBe(false);
    expect(result.factorContributions.reduce((sum, entry) => sum + entry.points, 0)).toBe(result.score);
  });
});
