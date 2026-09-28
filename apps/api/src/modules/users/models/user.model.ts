import type { SafeUser, UserRole } from '@safealert/contracts';
import { USER_ROLES } from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      required: true,
      enum: USER_ROLES,
      default: 'RESIDENT'
    },
    // LDFEW-127 notification profile. Location values are stored normalized (trimmed,
    // lowercased, punctuation removed) so warning scope targeting can match them exactly.
    area: {
      type: String,
      trim: true,
      maxlength: 300
    },
    district: {
      type: String,
      trim: true,
      maxlength: 120
    },
    country: {
      type: String,
      trim: true,
      maxlength: 120
    },
    phoneNumber: {
      type: String,
      trim: true,
      maxlength: 24
    },
    // Reused for Firebase Cloud Messaging device registration tokens.
    pushToken: {
      type: String,
      trim: true,
      select: false,
      maxlength: 4096
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Scope targeting always filters on role and active state plus one normalized location.
userSchema.index({ role: 1, isActive: 1, area: 1 });
userSchema.index({ role: 1, isActive: 1, district: 1 });
userSchema.index({ role: 1, isActive: 1, country: 1 });

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: { toString(): string };
  passwordHash?: string;
};

export const UserModel =
  (mongoose.models.User as Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>('User', userSchema);

export function toSafeUser(user: {
  _id: { toString(): string };
  name: string;
  email: string;
  role: UserRole;
}): SafeUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role
  };
}
