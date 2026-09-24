import type {
  CommunityReportSummary,
  CreateReportRequest,
  CreateReportResponse,
  GetCommunityReportResponse,
  GetCommunityReportsResponse,
  GetPendingOfficerReportResponse,
  GetPendingOfficerReportsResponse,
  GetResidentReportResponse,
  GetResidentReportsResponse,
  GetVerifiedOfficerReportsResponse,
  ReportReviewRequest,
  ReviewReportResponse
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { FieldConfirmationRepository } from '../../field-confirmations/repositories/fieldConfirmation.repository.js';

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
const officerPendingStatuses = ['PENDING'] as const;

export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly confirmations: FieldConfirmationRepository
  ) {}

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

  async listResidentReports(residentId: string): Promise<GetResidentReportsResponse> {
    return {
      reports: await this.repository.findReportsByResidentId(residentId)
    };
  }

  async getResidentReportById(
    residentId: string,
    reportId: string
  ): Promise<GetResidentReportResponse> {
    const report = await this.repository.findReportByIdAndResidentId(reportId, residentId);

    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    }

    return { report };
  }

  async listCommunityReportsForVolunteer(
    volunteerId: string,
    options: CommunityReportRetrievalOptions
  ): Promise<GetCommunityReportsResponse> {
    const submittedReportIds = new Set(
      (await this.confirmations.findByVolunteerId(volunteerId)).map((item) => item.reportId)
    );
    if (options.mode === 'nearby') {
      return {
        reports: (await this.repository.findNearbyCommunityReports({
          statuses: [...volunteerEligibleStatuses],
          longitude: options.longitude,
          latitude: options.latitude,
          radiusKm: options.radiusKm
        })).filter((report) => !submittedReportIds.has(report.id))
      };
    }

    const reports = await this.repository.findReportsByStatuses([...volunteerEligibleStatuses]);

    return {
      reports: reports.filter((report) => !submittedReportIds.has(report.id)).map<CommunityReportSummary>((report) => ({
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

  async getCommunityReportForVolunteer(reportId: string): Promise<GetCommunityReportResponse> {
    const report = await this.repository.findCommunityReportById(reportId, [...volunteerEligibleStatuses]);

    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Community report not found.');
    }

    return { report };
  }

  async listPendingReportsForOfficer(): Promise<GetPendingOfficerReportsResponse> {
    return {
      reports: await this.repository.findReportsByStatuses([...officerPendingStatuses])
    };
  }

  async getPendingReportForOfficer(reportId: string): Promise<GetPendingOfficerReportResponse> {
    const report = await this.repository.findReportById(reportId);

    if (!report || report.status !== 'PENDING') {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Pending report not found.');
    }

    return { report };
  }

  // Separate entry list keeps the pending review queue unchanged.
  async listVerifiedReportsForOfficer(): Promise<GetVerifiedOfficerReportsResponse> {
    return { reports: await this.repository.findReportsByStatuses(['VERIFIED']) };
  }

  async reviewReport(
    reportId: string,
    officerId: string,
    review: ReportReviewRequest
  ): Promise<ReviewReportResponse> {
    const report = await this.repository.findReportById(reportId);

    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    }

    if (report.status !== 'PENDING') {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only pending reports can be reviewed.');
    }

    const updatedReport = await this.repository.reviewReport({
      reportId,
      officerId,
      reviewedAt: new Date(),
      ...review
    });

    if (!updatedReport) {
      throw new ApiError(409, 'INVALID_REPORT_STATE', 'Only pending reports can be reviewed.');
    }

    return { report: updatedReport };
  }
}
