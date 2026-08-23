import {
  HAZARD_TYPES,
  REPORT_SEVERITIES,
  REPORT_STATUSES,
  type ReportVerificationEvent,
  type SafeReport
} from '@safealert/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const reportVerificationSchema = new mongoose.Schema(
  {
    verifiedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    verifiedAt: {
      type: Date,
      required: true
    }
  },
  {
    _id: false
  }
);

const reportVerificationHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['VERIFY']
    },
    verifiedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    verifiedAt: {
      type: Date,
      required: true
    }
  },
  {
    _id: false
  }
);

const geoJsonPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(value: number[]) {
          if (!Array.isArray(value) || value.length !== 2) {
            return false;
          }

          const [longitude, latitude] = value;
          return (
            typeof longitude === 'number' &&
            longitude >= -180 &&
            longitude <= 180 &&
            typeof latitude === 'number' &&
            latitude >= -90 &&
            latitude <= 90
          );
        },
        message: 'Location coordinates must be [longitude, latitude].'
      }
    }
  },
  {
    _id: false
  }
);

const reportSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true
    },
    hazardType: {
      type: String,
      required: true,
      enum: HAZARD_TYPES
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 1000
    },
    severity: {
      type: String,
      required: true,
      enum: REPORT_SEVERITIES
    },
    location: {
      type: geoJsonPointSchema,
      required: true
    },
    mediaReference: {
      type: String,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      required: true,
      enum: REPORT_STATUSES,
      default: 'PENDING'
    },
    verification: {
      type: reportVerificationSchema,
      required: false
    },
    verificationHistory: {
      type: [reportVerificationHistorySchema],
      required: true,
      default: []
    }
  },
  {
    timestamps: true
  }
);

reportSchema.index({ location: '2dsphere' });

export type ReportDocument = InferSchemaType<typeof reportSchema> & {
  _id: { toString(): string };
  residentId: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
  verification?: {
    verifiedById: { toString(): string };
    verifiedAt: Date;
  };
  verificationHistory?: ReportVerificationEvent[];
};

export const ReportModel =
  (mongoose.models.Report as Model<ReportDocument> | undefined) ??
  mongoose.model<ReportDocument>('Report', reportSchema);

export function toSafeReport(report: ReportDocument): SafeReport {
  const safeReport: SafeReport = {
    id: report._id.toString(),
    residentId: report.residentId.toString(),
    hazardType: report.hazardType,
    description: report.description,
    severity: report.severity,
    location: {
      type: 'Point',
      coordinates: [report.location.coordinates[0] ?? 0, report.location.coordinates[1] ?? 0]
    },
    status: report.status,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString()
  };

  if (report.verification) {
    safeReport.verifiedById = report.verification.verifiedById.toString();
    safeReport.verifiedAt = report.verification.verifiedAt.toISOString();
  }

  if (report.verificationHistory?.length) {
    safeReport.verificationHistory = report.verificationHistory.map((entry) => ({
      action: entry.action,
      verifiedById: entry.verifiedById.toString(),
      verifiedAt: entry.verifiedAt.toISOString()
    }));
  }

  if (report.mediaReference) {
    safeReport.mediaReference = report.mediaReference;
  }

  return safeReport;
}
