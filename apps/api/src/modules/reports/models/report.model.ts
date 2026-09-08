import {
  HAZARD_TYPES,
  REPORT_SEVERITIES,
  REPORT_STATUSES,
  type ReportReviewEvent,
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

const reportRejectionSchema = new mongoose.Schema(
  {
    rejectedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    rejectedAt: {
      type: Date,
      required: true
    },
    rejectionReason: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    _id: false
  }
);

type ReportReviewHistoryValidationContext = {
  action?: 'VERIFY' | 'REJECT';
};

const reportVerificationHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['VERIFY', 'REJECT']
    },
    verifiedById: {
      type: mongoose.Schema.Types.ObjectId,
      required(this: ReportReviewHistoryValidationContext): boolean {
        return this.action === 'VERIFY';
      },
      ref: 'User'
    },
    verifiedAt: {
      type: Date,
      required(this: ReportReviewHistoryValidationContext): boolean {
        return this.action === 'VERIFY';
      }
    },
    rejectedById: {
      type: mongoose.Schema.Types.ObjectId,
      required(this: ReportReviewHistoryValidationContext): boolean {
        return this.action === 'REJECT';
      },
      ref: 'User'
    },
    rejectedAt: {
      type: Date,
      required(this: ReportReviewHistoryValidationContext): boolean {
        return this.action === 'REJECT';
      }
    },
    rejectionReason: {
      type: String,
      required(this: ReportReviewHistoryValidationContext): boolean {
        return this.action === 'REJECT';
      },
      trim: true
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
    rejection: {
      type: reportRejectionSchema,
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
  rejection?: {
    rejectedById: { toString(): string };
    rejectedAt: Date;
    rejectionReason: string;
  };
  verificationHistory?: Array<{
    action: 'VERIFY' | 'REJECT';
    verifiedById?: { toString(): string };
    verifiedAt?: Date;
    rejectedById?: { toString(): string };
    rejectedAt?: Date;
    rejectionReason?: string;
  }>;
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

  if (report.rejection) {
    safeReport.rejectedById = report.rejection.rejectedById.toString();
    safeReport.rejectedAt = report.rejection.rejectedAt.toISOString();
    safeReport.rejectionReason = report.rejection.rejectionReason;
  }

  if (report.verificationHistory?.length) {
    safeReport.verificationHistory = report.verificationHistory.flatMap<ReportReviewEvent>((entry) => {
      if (entry.action === 'VERIFY' && entry.verifiedById && entry.verifiedAt) {
        return [
          {
            action: 'VERIFY',
            verifiedById: entry.verifiedById.toString(),
            verifiedAt: entry.verifiedAt.toISOString()
          }
        ];
      }

      if (
        entry.action === 'REJECT' &&
        entry.rejectedById &&
        entry.rejectedAt &&
        entry.rejectionReason
      ) {
        return [
          {
            action: 'REJECT',
            rejectedById: entry.rejectedById.toString(),
            rejectedAt: entry.rejectedAt.toISOString(),
            rejectionReason: entry.rejectionReason
          }
        ];
      }

      return [];
    });
  }

  if (report.mediaReference) {
    safeReport.mediaReference = report.mediaReference;
  }

  return safeReport;
}
