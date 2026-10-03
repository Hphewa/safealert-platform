import type { CommunityReportSummary, MonitoringReportSummary } from '@safealert/contracts';

import { ReportModel, toSafeReport } from '../models/report.model.js';
import type {
  CreateReportInput,
  CancelPendingResidentReportInput,
  NearbyCommunityReportsQuery,
  ReportRepository,
  ReviewReportInput,
  UpdatePendingResidentReportInput
} from './report.repository.js';
import { isSafeReportImageReference } from './reportImageEvidence.js';

export class MongooseReportRepository implements ReportRepository {
  async createReport(input: CreateReportInput) {
    const report = await ReportModel.create(input);
    return toSafeReport(report);
  }

  async findReportById(reportId: string) {
    const report = await ReportModel.findById(reportId).exec();

    return report ? toSafeReport(report) : null;
  }

  async findReportsByResidentId(residentId: string) {
    const reports = await ReportModel.find({ residentId }).sort({ createdAt: -1 }).exec();

    return reports.map(toSafeReport);
  }

  async findReportByIdAndResidentId(reportId: string, residentId: string) {
    const report = await ReportModel.findOne({ _id: reportId, residentId }).exec();

    return report ? toSafeReport(report) : null;
  }

  async findReportsByIds(reportIds: string[]) {
    if (reportIds.length === 0) return [];
    const reports = await ReportModel.find({ _id: { $in: reportIds } }).exec();
    return reports.map(toSafeReport);
  }

  async findVerifiedImageEvidenceByIds(reportIds: string[]) {
    if (reportIds.length === 0) return [];
    const reports = await ReportModel.find({ _id: { $in: reportIds }, status: 'VERIFIED' })
      .select('_id mediaReference createdAt').exec();
    return reports.flatMap(report => isSafeReportImageReference(report.mediaReference)
      ? [{ id: report._id.toString(), imageReference: report.mediaReference, createdAt: report.createdAt.toISOString() }]
      : []);
  }


  async findReportsByCommunityReportClusterId(communityReportClusterId: string) {
    const reports = await ReportModel.find({ communityReportClusterId }).sort({ createdAt: 1 }).exec();
    return reports.map(toSafeReport);
  }
  async findVerifiedSummariesByIds(reportIds: string[]): Promise<MonitoringReportSummary[]> {
    if (reportIds.length === 0) return [];
    const reports = await ReportModel.find({ _id: { $in: reportIds }, status: 'VERIFIED' })
      .select('_id description severity verification.verifiedAt').exec();
    return reports.map((report) => ({
      id: report._id.toString(), description: report.description, severity: report.severity,
      ...(report.verification?.verifiedAt ? { verifiedAt: report.verification.verifiedAt.toISOString() } : {})
    }));
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
          voiceEvidence: 1,
          communityReportClusterId: { $toString: '$communityReportClusterId' },
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
      ...(safeReport.mediaReference ? { mediaReference: safeReport.mediaReference } : {}),
      ...(safeReport.voiceEvidence ? { voiceEvidence: safeReport.voiceEvidence } : {}),
      ...(safeReport.communityReportClusterId ? { communityReportClusterId: safeReport.communityReportClusterId } : {})
    };
  }

  async setCommunityReportCluster(input: { reportId: string; communityReportClusterId: string | null }) {
    const report = await ReportModel.findByIdAndUpdate(
      input.reportId,
      input.communityReportClusterId
        ? { $set: { communityReportClusterId: input.communityReportClusterId } }
        : { $unset: { communityReportClusterId: '' } },
      { new: true, runValidators: true, timestamps: false }
    ).exec();

    return report ? toSafeReport(report) : null;
  }

  async updatePendingResidentReport(input: UpdatePendingResidentReportInput) {
    const { voiceEvidence, ...setUpdate } = input.update;
    const unsetUpdate = voiceEvidence === null ? { voiceEvidence: '' } : undefined;
    const updateDocument = {
      ...(Object.keys(setUpdate).length > 0 || voiceEvidence
        ? {
            $set: {
              ...setUpdate,
              ...(voiceEvidence ? { voiceEvidence } : {})
            }
          }
        : {}),
      ...(unsetUpdate ? { $unset: unsetUpdate } : {})
    };
    const report = await ReportModel.findOneAndUpdate(
      {
        _id: input.reportId,
        residentId: input.residentId,
        status: 'PENDING'
      },
      updateDocument,
      {
        new: true,
        runValidators: true
      }
    ).exec();

    return report ? toSafeReport(report) : null;
  }

  async cancelPendingResidentReport(input: CancelPendingResidentReportInput) {
    const report = await ReportModel.findOneAndUpdate(
      {
        _id: input.reportId,
        residentId: input.residentId,
        status: 'PENDING'
      },
      {
        $set: {
          status: 'CANCELLED',
          cancelledById: input.residentId,
          cancelledAt: input.cancelledAt
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).exec();

    return report ? toSafeReport(report) : null;
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
