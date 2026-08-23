import type {
  CommunityReportSummary,
  CreateReportRequest,
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

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
  findReportById(reportId: string): Promise<SafeReport | null>;
  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
  findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]>;
  findCommunityReportById(reportId: string, statuses: ReportStatus[]): Promise<CommunityReportSummary | null>;
  verifyReport(input: {
    reportId: string;
    verifiedById: string;
    verifiedAt: Date;
  }): Promise<SafeReport | null>;
}
