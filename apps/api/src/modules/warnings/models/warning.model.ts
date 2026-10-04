import mongoose, { type InferSchemaType, type Model } from 'mongoose';
import { WARNING_ATTACHMENT_REFERENCE_PATTERN, WARNING_DISTRICTS, WARNING_FIELD_LIMITS, WARNING_RISK_LEVELS, WARNING_STATUSES, type SafeWarning } from '@safealert/contracts';

const requiredText = (maxlength: number) => ({ type: String, required: true, trim: true, maxlength });
const warningSchema = new mongoose.Schema({
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskAssessment', required: true, index: true },
  hazardReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  affectedArea: requiredText(WARNING_FIELD_LIMITS.affectedArea),
  riskLevel: { type: String, enum: WARNING_RISK_LEVELS, required: true },
  requiredAction: requiredText(WARNING_FIELD_LIMITS.requiredAction),
  unsafeRoads: requiredText(WARNING_FIELD_LIMITS.unsafeRoads),
  safeRoutes: { type: String, trim: true, maxlength: WARNING_FIELD_LIMITS.safeRoutes },
  message: requiredText(WARNING_FIELD_LIMITS.message),
  attachments: {
    type: [{ type: String, trim: true, maxlength: WARNING_FIELD_LIMITS.attachmentUrl,
      validate: (value: string) => WARNING_ATTACHMENT_REFERENCE_PATTERN.test(value) || /^https?:\/\//i.test(value) }],
    default: [], validate: (values: string[]) => values.length <= WARNING_FIELD_LIMITS.attachments
  },
  status: { type: String, enum: WARNING_STATUSES, required: true, default: 'DRAFT' }
  ,notificationTarget: {
    scope: { type: String, enum: ['AFFECTED_AREA', 'DISTRICT', 'WHOLE_COUNTRY'] },
    district: { type: String, enum: WARNING_DISTRICTS },
    country: { type: String, enum: ['Sri Lanka'] }
  },
  publishedAt: { type: Date },
  publishedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // LDFEW-115 lifecycle audit: who performed the cancellation/archive and when.
  cancelledById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: { type: Date },
  archivedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  archivedAt: { type: Date }
}, { timestamps: true });

type WarningDocument = InferSchemaType<typeof warningSchema> & { _id: mongoose.Types.ObjectId };
export const WarningModel = (mongoose.models.Warning as Model<WarningDocument> | undefined) ??
  mongoose.model<WarningDocument>('Warning', warningSchema);

export function toSafeWarning(warning: WarningDocument): SafeWarning {
  return {
    id: warning._id.toString(), assessmentId: warning.assessmentId.toString(),
    hazardReportId: warning.hazardReportId.toString(), createdById: warning.createdById.toString(),
    affectedArea: warning.affectedArea, riskLevel: warning.riskLevel,
    requiredAction: warning.requiredAction, unsafeRoads: warning.unsafeRoads,
    ...(warning.safeRoutes ? { safeRoutes: warning.safeRoutes } : {}),
    message: warning.message, attachments: warning.attachments, status: warning.status,
    ...(warning.notificationTarget?.scope ? {
      notificationTarget: warning.notificationTarget.scope === 'DISTRICT'
        ? { scope: 'DISTRICT' as const, district: warning.notificationTarget.district! }
        : warning.notificationTarget.scope === 'WHOLE_COUNTRY'
          ? { scope: 'WHOLE_COUNTRY' as const, country: 'Sri Lanka' as const }
          : { scope: 'AFFECTED_AREA' as const }
    } : {}),
    createdAt: warning.createdAt.toISOString(), updatedAt: warning.updatedAt.toISOString(),
    ...(warning.publishedAt ? { publishedAt: warning.publishedAt.toISOString() } : {}),
    ...(warning.publishedById ? { publishedById: warning.publishedById.toString() } : {}),
    ...(warning.cancelledById ? { cancelledById: warning.cancelledById.toString() } : {}),
    ...(warning.cancelledAt ? { cancelledAt: warning.cancelledAt.toISOString() } : {}),
    ...(warning.archivedById ? { archivedById: warning.archivedById.toString() } : {}),
    ...(warning.archivedAt ? { archivedAt: warning.archivedAt.toISOString() } : {})
  };
}
