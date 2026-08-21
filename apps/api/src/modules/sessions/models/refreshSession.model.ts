import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    revokedAt: {
      type: Date
    },
    replacedByTokenHash: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

export type RefreshSessionDocument = InferSchemaType<typeof refreshSessionSchema> & {
  _id: { toString(): string };
  userId: { toString(): string };
};

export const RefreshSessionModel =
  (mongoose.models.RefreshSession as Model<RefreshSessionDocument> | undefined) ??
  mongoose.model<RefreshSessionDocument>('RefreshSession', refreshSessionSchema);
