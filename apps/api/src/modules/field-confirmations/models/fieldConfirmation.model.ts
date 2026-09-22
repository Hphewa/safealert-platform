import mongoose from 'mongoose';
import { FIELD_CONFIRMATION_REASON_MAX_LENGTH, UNABLE_TO_CONFIRM_REASONS } from '@safealert/contracts';

const schema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  volunteerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  outcome: { type: String, enum: ['CONFIRMED', 'UNABLE_TO_CONFIRM'], required: true },
  status: { type: String, enum: ['PENDING'], default: 'PENDING', required: true },
  reason: {
    type: String, enum: UNABLE_TO_CONFIRM_REASONS,
    required(this: { outcome?: string }) { return this.outcome === 'UNABLE_TO_CONFIRM'; }
  },
  reasonDetails: {
    type: String, trim: true, maxlength: FIELD_CONFIRMATION_REASON_MAX_LENGTH,
    required(this: { reason?: string }) { return this.reason === 'Other'; }
  }
}, { timestamps: true });

schema.index({ volunteerId: 1, createdAt: -1 });

export const FieldConfirmationModel = mongoose.model('FieldConfirmation', schema);
