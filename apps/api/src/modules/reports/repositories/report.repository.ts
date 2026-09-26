import type {
  CommunityReportSummary,
  CreateReportRequest,
  ReportReviewRequest,
  ReportStatus,
  SafeReport,
  UpdateResidentReportRequest
} from '@safealert/contracts';

export type CreateReportInput = CreateReportRequest & {
  residentId: string;
  status: 'PENDING';
};

export type SetCommunityReportClusterInput = {
  reportId: string;
  communityReportClusterId: string | null;
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

export type UpdatePendingResidentReportInput = {
  reportId: string;
  residentId: string;
  update: UpdateResidentReportRequest;
};

export type CancelPendingResidentReportInput = {
  reportId: string;
  residentId: string;
  cancelledAt: Date;
};

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
  findReportById(reportId: string): Promise<SafeReport | null>;
  findReportsByResidentId(residentId: string): Promise<SafeReport[]>;
  findReportByIdAndResidentId(reportId: string, residentId: string): Promise<SafeReport | null>;
  findReportsByIds(reportIds: string[]): Promise<SafeReport[]>;
  findReportsByCommunityReportClusterId(communityReportClusterId: string): Promise<SafeReport[]>;

  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
  findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]>;
  findCommunityReportById(reportId: string, statuses: ReportStatus[]): Promise<CommunityReportSummary | null>;
  setCommunityReportCluster(input: SetCommunityReportClusterInput): Promise<SafeReport | null>;
  updatePendingResidentReport(input: UpdatePendingResidentReportInput): Promise<SafeReport | null>;
  cancelPendingResidentReport(input: CancelPendingResidentReportInput): Promise<SafeReport | null>;
  reviewReport(input: ReviewReportInput): Promise<SafeReport | null>;
}
