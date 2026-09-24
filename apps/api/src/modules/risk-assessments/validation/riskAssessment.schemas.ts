import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, RISK_LEVELS,
  RISK_DECISION_REASON_MAX_LENGTH, RISK_DECISION_REASON_MIN_LENGTH,
  ROAD_ACCESSIBILITY_OPTIONS, WATER_LEVEL_TRENDS, WEATHER_CONDITIONS, type RiskAssessmentFactors
} from '@safealert/contracts';
import { z } from 'zod';

export const riskAssessmentIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ObjectId is required.');
const peopleCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const factorsSchema = z.object({
  hazardReportId: riskAssessmentIdSchema,
  hazardSeverity: z.enum(HAZARD_ASSESSMENT_SEVERITIES),
  peopleAffected: peopleCountSchema, vulnerablePeople: peopleCountSchema,
  roadAccessibility: z.enum(ROAD_ACCESSIBILITY_OPTIONS),
  infrastructureImpact: z.enum(INFRASTRUCTURE_IMPACT_LEVELS),
  waterLevelTrend: z.enum(WATER_LEVEL_TRENDS), weatherCondition: z.enum(WEATHER_CONDITIONS)
});
const validCounts = (input: RiskAssessmentFactors) => input.vulnerablePeople <= input.peopleAffected;
const countsError = { message: 'Vulnerable people cannot exceed people affected.', path: ['vulnerablePeople'] };
// Reject forged audit/scoring fields on both preview and persistence requests.
export const calculateRiskAssessmentSchema = factorsSchema.strict().refine(validCounts, countsError);
export const createRiskAssessmentSchema = factorsSchema.extend({
  finalRiskLevel: z.enum(RISK_LEVELS),
  decisionReason: z.string().trim()
    .min(RISK_DECISION_REASON_MIN_LENGTH, 'Decision reason must be at least 10 characters.')
    .max(RISK_DECISION_REASON_MAX_LENGTH, 'Decision reason must be at most 500 characters.').optional()
}).strict().refine(validCounts, countsError);
