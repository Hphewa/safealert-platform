import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, RISK_ASSESSMENT_CLOSURE_REASONS,
  RISK_ASSESSMENT_STATUSES,
  RISK_DECISION_REASON_MAX_LENGTH, RISK_DECISION_REASON_MIN_LENGTH, RISK_LEVELS,
  ROAD_ACCESSIBILITY_OPTIONS, WATER_LEVEL_TRENDS, WEATHER_CONDITIONS,
  type SafeRiskAssessment
} from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const countDefinition = {
  type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger
} as const;
const riskAssessmentSchema = new mongoose.Schema({
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, index: true },
  assessedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hazardSeverity: { type: String, enum: HAZARD_ASSESSMENT_SEVERITIES, required: true },
  peopleAffected: countDefinition,
  vulnerablePeople: countDefinition,
  roadAccessibility: { type: String, enum: ROAD_ACCESSIBILITY_OPTIONS, required: true },
  infrastructureImpact: { type: String, enum: INFRASTRUCTURE_IMPACT_LEVELS, required: true },
  waterLevelTrend: { type: String, enum: WATER_LEVEL_TRENDS, required: true },
  weatherCondition: { type: String, enum: WEATHER_CONDITIONS, required: true },
  calculatedScore: { type: Number, required: true, min: 0 },
  systemSuggestedRisk: { type: String, enum: RISK_LEVELS, required: true },
  finalRiskLevel: { type: String, enum: RISK_LEVELS, required: true },
  decisionReason: {
    type: String, trim: true,
    minlength: RISK_DECISION_REASON_MIN_LENGTH, maxlength: RISK_DECISION_REASON_MAX_LENGTH
  },
  previousAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment' },
  reassessmentReason: {
    type: String, trim: true,
    minlength: RISK_DECISION_REASON_MIN_LENGTH, maxlength: RISK_DECISION_REASON_MAX_LENGTH
  },
  closureReason: { type: String, enum: RISK_ASSESSMENT_CLOSURE_REASONS },
  closureNote: {
    type: String, trim: true,
    minlength: RISK_DECISION_REASON_MIN_LENGTH, maxlength: RISK_DECISION_REASON_MAX_LENGTH
  },
  closedAt: { type: Date },
  closedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: RISK_ASSESSMENT_STATUSES, required: true, default: 'ACTIVE' },
  assessedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

// Database uniqueness arbitrates racing requests; CLOSED/VOID records can coexist later.
riskAssessmentSchema.index({ incidentId: 1, status: 1 }, {
  unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_assessment_per_incident'
});
riskAssessmentSchema.pre('validate', function () {
  if (this.vulnerablePeople > this.peopleAffected) {
    this.invalidate('vulnerablePeople', 'Vulnerable people cannot exceed people affected.');
  }
  if (this.finalRiskLevel !== this.systemSuggestedRisk && !this.decisionReason) {
    this.invalidate('decisionReason', 'A decision reason is required when overriding suggested risk.');
  }
  if (this.previousAssessmentId && !this.reassessmentReason) {
    this.invalidate('reassessmentReason', 'A reassessment reason is required for reassessed records.');
  }
  if (RISK_ASSESSMENT_CLOSURE_REASONS.some((reason) => reason === this.closureReason)) {
    if (this.status !== 'CLOSED') this.invalidate('status', 'Records with a closure reason must be closed.');
    if (!this.closedAt) this.invalidate('closedAt', 'A closure date is required for closed records.');
    if (!this.closedById) this.invalidate('closedById', 'A closing officer is required for closed records.');
    if (this.closureReason === 'OTHER' && !this.closureNote) {
      this.invalidate('closureNote', 'A closure note is required for OTHER.');
    }
  }
});
export type RiskAssessmentDocument = InferSchemaType<typeof riskAssessmentSchema> & { _id: mongoose.Types.ObjectId };
export const RiskAssessmentModel =
  (mongoose.models.RiskAssessment as Model<RiskAssessmentDocument> | undefined) ??
  mongoose.model<RiskAssessmentDocument>('RiskAssessment', riskAssessmentSchema);

// Explicit serialization keeps Mongoose internals out of API responses.
export function toSafeRiskAssessment(assessment: RiskAssessmentDocument): SafeRiskAssessment {
  return {
    id: assessment._id.toString(), incidentId: assessment.incidentId.toString(),
    assessedById: assessment.assessedById.toString(), hazardSeverity: assessment.hazardSeverity,
    peopleAffected: assessment.peopleAffected, vulnerablePeople: assessment.vulnerablePeople,
    roadAccessibility: assessment.roadAccessibility, infrastructureImpact: assessment.infrastructureImpact,
    waterLevelTrend: assessment.waterLevelTrend, weatherCondition: assessment.weatherCondition,
    calculatedScore: assessment.calculatedScore, systemSuggestedRisk: assessment.systemSuggestedRisk,
    finalRiskLevel: assessment.finalRiskLevel,
    ...(assessment.decisionReason ? { decisionReason: assessment.decisionReason } : {}),
    ...(assessment.previousAssessmentId ? { previousAssessmentId: assessment.previousAssessmentId.toString() } : {}),
    ...(assessment.reassessmentReason ? { reassessmentReason: assessment.reassessmentReason } : {}),
    ...(assessment.closureReason ? { closureReason: assessment.closureReason } : {}),
    ...(assessment.closureNote ? { closureNote: assessment.closureNote } : {}),
    ...(assessment.closedAt ? { closedAt: assessment.closedAt.toISOString() } : {}),
    ...(assessment.closedById ? { closedById: assessment.closedById.toString() } : {}),
    status: assessment.status, assessedAt: assessment.assessedAt.toISOString(),
    createdAt: assessment.createdAt.toISOString(), updatedAt: assessment.updatedAt.toISOString()
  };
}
