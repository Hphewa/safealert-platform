import { ReportModel, toSafeReport } from '../models/report.model.js';
import type { CreateReportInput, ReportRepository } from './report.repository.js';

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
}
