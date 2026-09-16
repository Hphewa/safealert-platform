import type {
  CommunityReportSummary,
  CreateReportRequest,
  CreateReportResponse,
  GetCommunityReportResponse,
  GetCommunityReportsResponse,
  GetPendingOfficerReportResponse,
  GetPendingOfficerReportsResponse,
  GetReportEvidenceResponse,
  UserRole,
  ReportReviewRequest,
  ReviewReportResponse
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';

import type { ReportRepository } from '../repositories/report.repository.js';
import { ReportEvidenceStorage } from './reportEvidence.storage.js';

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
    private readonly evidenceStorage = new ReportEvidenceStorage()
  ) {}

  async createResidentReport(
    residentId: string,
    input: CreateReportRequest
  ): Promise<CreateReportResponse> {
    const uploadedReference = input.photo
      ? await this.evidenceStorage.save(input.photo.base64)
      : undefined;
    const mediaReference = uploadedReference ?? input.mediaReference;
    try {
      const report = await this.repository.createReport({
        residentId,
        hazardType: input.hazardType,
        description: input.description,
        severity: input.severity,
        location: input.location,
        ...(mediaReference ? { mediaReference } : {}),
        status: 'PENDING'
      });
      return { report };
    } catch (error) {
      if (uploadedReference) {
        await this.evidenceStorage.remove(uploadedReference);
      }
      throw error;
    }
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

  async getCommunityReportForVolunteer(reportId: string): Promise<GetCommunityReportResponse> {
    const report = await this.repository.findCommunityReportById(reportId, [...volunteerEligibleStatuses]);

    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Community report not found.');
    }
    return { report };
  }

  async getReportEvidence(
    reportId: string, user: { id: string; role: UserRole }
  ): Promise<GetReportEvidenceResponse> {
    const report = await this.repository.findReportById(reportId);
    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    }
    if (user.role !== 'DISASTER_OFFICER' &&
        !(user.role === 'RESIDENT' && report.residentId === user.id) &&
        !(user.role === 'COMMUNITY_VOLUNTEER' && report.status === 'PENDING')) {
      throw new ApiError(403, 'FORBIDDEN', 'You cannot view this report evidence.');
    }
    return { dataUri: await this.evidenceStorage.read(report.mediaReference) };
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
