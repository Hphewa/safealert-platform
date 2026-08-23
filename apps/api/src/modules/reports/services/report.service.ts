import type {
  CommunityReportSummary,
  CreateReportRequest,
  CreateReportResponse,
  GetCommunityReportsResponse
} from '@safealert/contracts';

import type { ReportRepository } from '../repositories/report.repository.js';

export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  async createResidentReport(
    residentId: string,
    input: CreateReportRequest
  ): Promise<CreateReportResponse> {
    const report = await this.repository.createReport({
      residentId,
      hazardType: input.hazardType,
      description: input.description,
      severity: input.severity,
      location: input.location,
      ...(input.mediaReference ? { mediaReference: input.mediaReference } : {}),
      status: 'PENDING'
    });

    return { report };
  }

  async listCommunityReportsForVolunteer(): Promise<GetCommunityReportsResponse> {
    const reports = await this.repository.findReportsByStatuses(['PENDING']);

    return {
      reports: reports.map<CommunityReportSummary>((report) => ({
        id: report.id,
        hazardType: report.hazardType,
        description: report.description,
        severity: report.severity,
        location: report.location,
        status: report.status,
        createdAt: report.createdAt,
        ...(report.mediaReference ? { mediaReference: report.mediaReference } : {})
      }))
    };
  }
}
