import type { CreateReportRequest, CreateReportResponse } from '@safealert/contracts';

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
}
