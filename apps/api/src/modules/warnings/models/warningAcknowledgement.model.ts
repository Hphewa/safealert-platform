import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const warningAcknowledgementSchema = new mongoose.Schema({
  warningId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warning', required: true },
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acknowledgedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

warningAcknowledgementSchema.index({ warningId: 1, residentId: 1 }, { unique: true });
type WarningAcknowledgementDocument = InferSchemaType<typeof warningAcknowledgementSchema> & { _id: mongoose.Types.ObjectId };
export const WarningAcknowledgementModel =
  (mongoose.models.WarningAcknowledgement as Model<WarningAcknowledgementDocument> | undefined) ??
  mongoose.model<WarningAcknowledgementDocument>('WarningAcknowledgement', warningAcknowledgementSchema);
