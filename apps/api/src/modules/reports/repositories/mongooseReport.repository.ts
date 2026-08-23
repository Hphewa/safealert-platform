import type { CommunityReportSummary } from '@safealert/contracts';

import { ReportModel, toSafeReport } from '../models/report.model.js';
import type { CreateReportInput, NearbyCommunityReportsQuery, ReportRepository } from './report.repository.js';

export class MongooseReportRepository implements ReportRepository {
  async createReport(input: CreateReportInput) {
    const report = await ReportModel.create(input);
    return toSafeReport(report);
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
}
