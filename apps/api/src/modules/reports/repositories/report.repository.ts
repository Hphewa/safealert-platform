import type {
  CommunityReportSummary,
  CreateReportRequest,
  ReportReviewRequest,
  ReportStatus,
  MonitoringReportSummary,
  SafeReport,
  UpdateResidentReportRequest
} from '@safealert/contracts';

export type CreateReportInput = CreateReportRequest & {
  residentId: string;
  status: 'PENDING';
  clientOperationId?: string;
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

export type DeletePendingResidentReportInput = {
  reportId: string;
  residentId: string;
};

export type VerifiedReportImageEvidence = {
  id: string;
  imageReference: string;
  createdAt: string;
};

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
  findReportById(reportId: string): Promise<SafeReport | null>;
  findReportsByResidentId(residentId: string): Promise<SafeReport[]>;
  findReportByIdAndResidentId(reportId: string, residentId: string): Promise<SafeReport | null>;
  findReportByClientOperationId(residentId: string, clientOperationId: string): Promise<SafeReport | null>;
  findReportsByIds(reportIds: string[]): Promise<SafeReport[]>;
  findVerifiedImageEvidenceByIds(reportIds: string[]): Promise<VerifiedReportImageEvidence[]>;
  findReportsByCommunityReportClusterId(communityReportClusterId: string): Promise<SafeReport[]>;
  findVerifiedSummariesByIds(reportIds: string[]): Promise<MonitoringReportSummary[]>;

  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
  findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]>;
  findCommunityReportById(reportId: string, statuses: ReportStatus[]): Promise<CommunityReportSummary | null>;
  setCommunityReportCluster(input: SetCommunityReportClusterInput): Promise<SafeReport | null>;
  updatePendingResidentReport(input: UpdatePendingResidentReportInput): Promise<SafeReport | null>;
  deletePendingResidentReport(input: DeletePendingResidentReportInput): Promise<boolean>;
  reviewReport(input: ReviewReportInput): Promise<SafeReport | null>;
}
