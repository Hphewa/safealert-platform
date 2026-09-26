import type {
  GeoJsonPoint,
  HazardType,
  ReportSeverity,
  SafeCommunityReportClusterSummary
} from '@safealert/contracts';

export type CreateCommunityReportClusterInput = {
  hazardType: HazardType;
  centerLocation: GeoJsonPoint;
  firstReportedAt: Date;
  lastReportedAt: Date;
  reportCount: number;
  activeReportCount: number;
  pendingReportCount: number;
  verifiedReportCount: number;
  rejectedReportCount: number;
  cancelledReportCount: number;
  resolvedReportCount: number;
  highestSeverity: ReportSeverity;
};

export type UpdateCommunityReportClusterSummaryInput = Omit<
  CreateCommunityReportClusterInput,
  'hazardType'
>;

export type CommunityReportClusterCandidate = {
  cluster: SafeCommunityReportClusterSummary;
  distanceMeters: number;
};

export interface CommunityReportClusterRepository {
  create(input: CreateCommunityReportClusterInput): Promise<SafeCommunityReportClusterSummary>;
  findById(clusterId: string): Promise<SafeCommunityReportClusterSummary | null>;
  findCandidateClusters(query: {
    hazardType: HazardType;
    location: GeoJsonPoint;
    radiusMeters: number;
  }): Promise<CommunityReportClusterCandidate[]>;
  findClustersWithPendingReports(): Promise<SafeCommunityReportClusterSummary[]>;
  updateSummary(
    clusterId: string,
    input: UpdateCommunityReportClusterSummaryInput
  ): Promise<SafeCommunityReportClusterSummary | null>;
  deleteById(clusterId: string): Promise<void>;
}

