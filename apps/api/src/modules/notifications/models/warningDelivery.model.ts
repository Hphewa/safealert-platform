import mongoose, { type InferSchemaType, type Model } from 'mongoose';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_PROVIDERS,
  NOTIFICATION_SKIP_REASONS,
  type SafeWarningNotificationDelivery
} from '@safealert/contracts';

const warningDeliverySchema = new mongoose.Schema({
  warningId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warning', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
  status: { type: String, enum: NOTIFICATION_DELIVERY_STATUSES, required: true },
  provider: { type: String, enum: NOTIFICATION_PROVIDERS },
  providerMessageId: { type: String, trim: true, maxlength: 512 },
  providerStatus: { type: String, trim: true, maxlength: 64 },
  skipReason: { type: String, enum: NOTIFICATION_SKIP_REASONS },
  // Only sanitized provider values are stored. Credentials are never persisted.
  errorCode: { type: String, trim: true, maxlength: 128 },
  errorMessage: { type: String, trim: true, maxlength: 500 },
  sentAt: { type: Date },
  attemptCount: { type: Number, required: true, default: 1 },
  attempts: [{ attempt: { type: Number, required: true }, status: { type: String, enum: NOTIFICATION_DELIVERY_STATUSES, required: true }, attemptedAt: { type: Date, required: true }, provider: { type: String, enum: NOTIFICATION_PROVIDERS }, providerStatus: String, errorCode: String, errorMessage: String }]
}, { timestamps: true });

// Idempotency: at most one delivery record per warning, recipient and channel. Republishing
// or double-triggering publication cannot create a second SMS or push notification.
warningDeliverySchema.index({ warningId: 1, recipientId: 1, channel: 1 }, { unique: true });

type WarningDeliveryDocument = InferSchemaType<typeof warningDeliverySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WarningDeliveryModel =
  (mongoose.models.WarningDelivery as Model<WarningDeliveryDocument> | undefined) ??
  mongoose.model<WarningDeliveryDocument>('WarningDelivery', warningDeliverySchema);

export function toSafeWarningDelivery(delivery: WarningDeliveryDocument): SafeWarningNotificationDelivery {
  return {
    id: delivery._id.toString(),
    warningId: delivery.warningId.toString(),
    recipientId: delivery.recipientId.toString(),
    channel: delivery.channel,
    status: delivery.status,
    ...(delivery.provider ? { provider: delivery.provider } : {}),
    ...(delivery.providerMessageId ? { providerMessageId: delivery.providerMessageId } : {}),
    ...(delivery.providerStatus ? { providerStatus: delivery.providerStatus } : {}),
    ...(delivery.skipReason ? { skipReason: delivery.skipReason } : {}),
    ...(delivery.errorCode ? { errorCode: delivery.errorCode } : {}),
    ...(delivery.errorMessage ? { errorMessage: delivery.errorMessage } : {}),
    ...(delivery.sentAt ? { sentAt: delivery.sentAt.toISOString() } : {}),
    attemptCount: delivery.attemptCount,
    attempts: delivery.attempts.map((attempt) => ({ attempt: attempt.attempt, status: attempt.status, attemptedAt: attempt.attemptedAt.toISOString(), ...(attempt.provider ? { provider: attempt.provider } : {}), ...(attempt.providerStatus ? { providerStatus: attempt.providerStatus } : {}), ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}), ...(attempt.errorMessage ? { errorMessage: attempt.errorMessage } : {}) })),
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString()
  };
}
