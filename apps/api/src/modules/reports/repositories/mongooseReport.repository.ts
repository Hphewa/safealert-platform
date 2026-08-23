import { ReportModel, toSafeReport } from '../models/report.model.js';
import type { CreateReportInput, ReportRepository } from './report.repository.js';

export class MongooseReportRepository implements ReportRepository {
  async createReport(input: CreateReportInput) {
    const report = await ReportModel.create(input);
    return toSafeReport(report);
  }
}
