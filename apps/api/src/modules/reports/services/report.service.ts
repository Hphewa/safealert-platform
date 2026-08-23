import type {
  CommunityReportSummary,
  CreateReportRequest,
  CreateReportResponse,
  GetCommunityReportsResponse
} from '@safealert/contracts';

import type { ReportRepository } from '../repositories/report.repository.js';

export type CommunityReportRetrievalOptions =
  | {
      mode: 'incoming';
    }
  | {
      mode: 'nearby';
      longitude: number;
      latitude: number;
      radiusKm: number;
    };

const volunteerEligibleStatuses = ['PENDING'] as const;

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

  async listCommunityReportsForVolunteer(
    options: CommunityReportRetrievalOptions
  ): Promise<GetCommunityReportsResponse> {
    if (options.mode === 'nearby') {
      return {
        reports: await this.repository.findNearbyCommunityReports({
          statuses: [...volunteerEligibleStatuses],
          longitude: options.longitude,
          latitude: options.latitude,
          radiusKm: options.radiusKm
        })
      };
    }

    const reports = await this.repository.findReportsByStatuses([...volunteerEligibleStatuses]);

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
