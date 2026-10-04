import {
  HAZARD_TYPES,
  REPORT_SEVERITIES,
  type SafeCommunityReportClusterSummary
} from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const clusterLocationSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true, default: 'Point' },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator(coordinates: number[]) {
        if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
        const longitude = coordinates[0];
        const latitude = coordinates[1];
        if (longitude === undefined || latitude === undefined) return false;
        return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
          && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
      },
      message: 'Cluster center must contain valid [longitude, latitude] coordinates.'
    }
  }
}, { _id: false });

const communityReportClusterSchema = new mongoose.Schema({
  hazardType: { type: String, enum: HAZARD_TYPES, required: true },
  centerLocation: { type: clusterLocationSchema, required: true },
  firstReportedAt: { type: Date, required: true },
  lastReportedAt: { type: Date, required: true },
  reportCount: { type: Number, required: true, min: 0, default: 0 },
  activeReportCount: { type: Number, required: true, min: 0, default: 0 },
  pendingReportCount: { type: Number, required: true, min: 0, default: 0 },
  verifiedReportCount: { type: Number, required: true, min: 0, default: 0 },
  rejectedReportCount: { type: Number, required: true, min: 0, default: 0 },
  cancelledReportCount: { type: Number, required: true, min: 0, default: 0 },
  resolvedReportCount: { type: Number, required: true, min: 0, default: 0 },
  highestSeverity: { type: String, enum: REPORT_SEVERITIES, required: true }
}, { timestamps: true });

communityReportClusterSchema.index({ centerLocation: '2dsphere' });
communityReportClusterSchema.index({ hazardType: 1, lastReportedAt: -1 });

export type CommunityReportClusterDocument = InferSchemaType<typeof communityReportClusterSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CommunityReportClusterModel =
  (mongoose.models.CommunityReportCluster as Model<CommunityReportClusterDocument> | undefined) ??
  mongoose.model<CommunityReportClusterDocument>('CommunityReportCluster', communityReportClusterSchema);

export function toSafeCommunityReportCluster(
  cluster: CommunityReportClusterDocument
): SafeCommunityReportClusterSummary {
  return {
    id: cluster._id.toString(),
    hazardType: cluster.hazardType,
    centerLocation: {
      type: 'Point',
      coordinates: [cluster.centerLocation.coordinates[0]!, cluster.centerLocation.coordinates[1]!]
    },
    firstReportedAt: cluster.firstReportedAt.toISOString(),
    lastReportedAt: cluster.lastReportedAt.toISOString(),
    reportCount: cluster.reportCount,
    activeReportCount: cluster.activeReportCount,
    pendingReportCount: cluster.pendingReportCount,
    verifiedReportCount: cluster.verifiedReportCount,
    rejectedReportCount: cluster.rejectedReportCount,
    cancelledReportCount: cluster.cancelledReportCount,
    resolvedReportCount: cluster.resolvedReportCount,
    highestSeverity: cluster.highestSeverity,
    photoEvidenceCount: 0,
    voiceEvidenceCount: 0,
    fieldConfirmationCount: 0,
    createdAt: cluster.createdAt.toISOString(),
    updatedAt: cluster.updatedAt.toISOString()
  };
}
