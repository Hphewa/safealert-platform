import type {
  CommunityReportSummary,
  CreateReportRequest,
  ReportReviewRequest,
  ReportStatus,
  SafeReport
} from '@safealert/contracts';

export type CreateReportInput = CreateReportRequest & {
  residentId: string;
  status: 'PENDING';
};

export type NearbyCommunityReportsQuery = {
  statuses: ReportStatus[];
  longitude: number;
  latitude: number;
  radiusKm: number;
};

export type ReviewReportInput = ReportReviewRequest & {
  reportId: string;
  officerId: string;
  reviewedAt: Date;
};

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
  findReportById(reportId: string): Promise<SafeReport | null>;
  findReportsByIds(reportIds: string[]): Promise<SafeReport[]>;
  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
  findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]>;
  findCommunityReportById(reportId: string, statuses: ReportStatus[]): Promise<CommunityReportSummary | null>;
  reviewReport(input: ReviewReportInput): Promise<SafeReport | null>;
}
