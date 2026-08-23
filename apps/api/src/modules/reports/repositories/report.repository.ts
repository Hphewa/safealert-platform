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
  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
  findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]>;
}
