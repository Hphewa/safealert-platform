import type { CommunityReportSummary } from '@safealert/contracts';

import { ReportModel, toSafeReport } from '../models/report.model.js';
import type {
  CreateReportInput,
  NearbyCommunityReportsQuery,
  ReportRepository,
  ReviewReportInput
} from './report.repository.js';

export class MongooseReportRepository implements ReportRepository {
  async createReport(input: CreateReportInput) {
    const report = await ReportModel.create(input);
    return toSafeReport(report);
  }

  async findReportById(reportId: string) {
    const report = await ReportModel.findById(reportId).exec();

    return report ? toSafeReport(report) : null;
  }

  async findReportsByStatuses(statuses: CreateReportInput['status'][]) {
    const reports = await ReportModel.find({
      status: {
        $in: statuses
      }
    })
      .sort({ createdAt: -1 })
      .exec();

    return reports.map(toSafeReport);
  }

  async findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]> {
    const reports = await ReportModel.aggregate<CommunityReportSummary>([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [query.longitude, query.latitude]
          },
          distanceField: 'distanceMeters',
          maxDistance: query.radiusKm * 1000,
          spherical: true,
          query: {
            status: {
              $in: query.statuses
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          hazardType: 1,
          description: 1,
          severity: 1,
          location: 1,
          status: 1,
          createdAt: {
            $dateToString: {
              date: '$createdAt',
              format: '%Y-%m-%dT%H:%M:%S.%LZ',
              timezone: 'UTC'
            }
          },
          mediaReference: 1,
          distanceKm: {
            $round: [{ $divide: ['$distanceMeters', 1000] }, 2]
          }
        }
      }
    ]).exec();

    return reports;
  }

  async findCommunityReportById(reportId: string, statuses: CreateReportInput['status'][]) {
    const report = await ReportModel.findOne({
      _id: reportId,
      status: {
        $in: statuses
      }
    }).exec();

    if (!report) {
      return null;
    }

    const safeReport = toSafeReport(report);

    return {
      id: safeReport.id,
      hazardType: safeReport.hazardType,
      description: safeReport.description,
      severity: safeReport.severity,
      location: safeReport.location,
      status: safeReport.status,
      createdAt: safeReport.createdAt,
      ...(safeReport.mediaReference ? { mediaReference: safeReport.mediaReference } : {})
    };
  }

  async reviewReport(input: ReviewReportInput) {
    const reviewUpdate =
      input.action === 'VERIFY'
        ? {
            status: 'VERIFIED' as const,
            audit: {
              verifiedById: input.officerId,
              verifiedAt: input.reviewedAt
            },
            history: {
              action: 'VERIFY' as const,
              verifiedById: input.officerId,
              verifiedAt: input.reviewedAt
            }
          }
        : {
            status: 'REJECTED' as const,
            audit: {
              rejectedById: input.officerId,
              rejectedAt: input.reviewedAt,
              rejectionReason: input.rejectionReason
            },
            history: {
              action: 'REJECT' as const,
              rejectedById: input.officerId,
              rejectedAt: input.reviewedAt,
              rejectionReason: input.rejectionReason
            }
          };

    const report = await ReportModel.findOneAndUpdate(
      {
        _id: input.reportId,
        status: 'PENDING'
      },
      {
        $set: {
          status: reviewUpdate.status,
          [input.action === 'VERIFY' ? 'verification' : 'rejection']: reviewUpdate.audit,
          updatedAt: input.reviewedAt
        },
        $push: {
          verificationHistory: reviewUpdate.history
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).exec();

    return report ? toSafeReport(report) : null;
  }
}
