import type {
  FieldConfirmation,
  GetOfficerCommunityReportClusterResponse,
  GetOfficerCommunityReportClustersResponse,
  SafeCommunityReportClusterSummary,
  SafeReport
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { FieldConfirmationRepository } from '../../field-confirmations/repositories/fieldConfirmation.repository.js';
import type { ReportRepository } from '../../reports/repositories/report.repository.js';
import { getCommunityReportGroupingRule } from '../communityReportGrouping.config.js';
import type { CommunityReportClusterRepository } from '../repositories/communityReportCluster.repository.js';
import {
  averageReportLocation,
  countReportsByStatus,
  highestSeverity,
  isActiveClusterReport
} from './communityReportClusterSummary.js';

export class CommunityReportGroupingService {
  constructor(
    private readonly clusters: CommunityReportClusterRepository,
    private readonly reports: ReportRepository,
    private readonly confirmations: FieldConfirmationRepository
  ) {}

  async assignReportToCluster(report: SafeReport): Promise<SafeReport> {
    if (report.communityReportClusterId) {
      await this.recomputeCluster(report.communityReportClusterId);
      return report;
    }

    const candidate = await this.findMatchingCluster(report);
    if (candidate) {
      return this.attachReportToCluster(report, candidate.id);
    }

    return this.createClusterForReport(report);
  }

  async reassignReport(report: SafeReport, previousClusterId?: string): Promise<SafeReport> {
    const candidate = await this.findMatchingCluster(report);
    const updated = candidate
      ? await this.attachReportToCluster(report, candidate.id)
      : await this.createClusterForReport(report);

    if (previousClusterId && previousClusterId !== updated.communityReportClusterId) {
      await this.recomputeCluster(previousClusterId);
    }

    return updated;
  }

  async recomputeCluster(clusterId: string): Promise<SafeCommunityReportClusterSummary | null> {
    const memberReports = await this.reports.findReportsByCommunityReportClusterId(clusterId);

    if (memberReports.length === 0) {
      await this.clusters.deleteById(clusterId);
      return null;
    }

    const activeReports = memberReports.filter(isActiveClusterReport);
    const severityReports = activeReports.length ? activeReports : memberReports;
    const sortedByCreatedAt = [...memberReports].sort((left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );
    const counts = countReportsByStatus(memberReports);

    return this.clusters.updateSummary(clusterId, {
      centerLocation: averageReportLocation(memberReports),
      firstReportedAt: new Date(sortedByCreatedAt[0]!.createdAt),
      lastReportedAt: new Date(sortedByCreatedAt[sortedByCreatedAt.length - 1]!.createdAt),
      reportCount: memberReports.length,
      activeReportCount: activeReports.length,
      pendingReportCount: counts.PENDING,
      verifiedReportCount: counts.VERIFIED,
      rejectedReportCount: counts.REJECTED,
      cancelledReportCount: counts.CANCELLED,
      resolvedReportCount: counts.RESOLVED,
      highestSeverity: highestSeverity(severityReports)
    });
  }

  async listOfficerClusters(): Promise<GetOfficerCommunityReportClustersResponse> {
    const clusters = await this.clusters.findClustersWithPendingReports();
    return {
      clusters: await Promise.all(clusters.map((cluster) => this.enrichClusterSummary(cluster)))
    };
  }

  async getOfficerCluster(clusterId: string): Promise<GetOfficerCommunityReportClusterResponse> {
    const cluster = await this.clusters.findById(clusterId);
    if (!cluster) throw new ApiError(404, 'COMMUNITY_REPORT_CLUSTER_NOT_FOUND', 'Community incident is no longer available.');

    const memberReports = await this.reports.findReportsByCommunityReportClusterId(cluster.id);
    if (memberReports.length === 0) {
      throw new ApiError(404, 'COMMUNITY_REPORT_CLUSTER_NOT_FOUND', 'Community incident is no longer available.');
    }

    const { all: confirmations, byReport: confirmationsByReport } = await this.findConfirmationsByReport(memberReports);
    const enrichedCluster = this.applyEvidenceCounts(cluster, memberReports, confirmations);

    return {
      cluster: {
        ...enrichedCluster,
        reports: memberReports.map((report) => ({
          ...report,
          fieldConfirmationCount: confirmationsByReport.get(report.id)?.length ?? 0
        })),
        fieldConfirmations: confirmations.map((confirmation) => ({
          id: confirmation.id,
          reportId: confirmation.reportId,
          outcome: confirmation.outcome,
          createdAt: confirmation.createdAt
        }))
      }
    };
  }

  async relatedReportCount(report: SafeReport) {
    if (!report.communityReportClusterId) return 0;
    const memberReports = await this.reports.findReportsByCommunityReportClusterId(report.communityReportClusterId);
    return Math.max(0, memberReports.filter((member) => member.id !== report.id).length);
  }

  private async findMatchingCluster(report: SafeReport) {
    const rule = getCommunityReportGroupingRule(report.hazardType);
    const candidates = await this.clusters.findCandidateClusters({
      hazardType: report.hazardType,
      location: report.location,
      radiusMeters: rule.radiusMeters
    });
    const reportTime = Date.parse(report.createdAt);
    const timeWindowMs = rule.timeWindowMinutes * 60 * 1000;

    return candidates
      .filter(({ cluster }) => {
        const clusterTime = Date.parse(cluster.lastReportedAt);
        return Number.isFinite(reportTime) &&
          Number.isFinite(clusterTime) &&
          Math.abs(reportTime - clusterTime) <= timeWindowMs;
      })
      .sort((left, right) =>
        left.distanceMeters - right.distanceMeters ||
        Date.parse(right.cluster.lastReportedAt) - Date.parse(left.cluster.lastReportedAt) ||
        right.cluster.reportCount - left.cluster.reportCount ||
        left.cluster.id.localeCompare(right.cluster.id)
      )[0]?.cluster ?? null;
  }

  private async createClusterForReport(report: SafeReport) {
    const reportedAt = new Date(report.createdAt);
    const cluster = await this.clusters.create({
      hazardType: report.hazardType,
      centerLocation: report.location,
      firstReportedAt: reportedAt,
      lastReportedAt: reportedAt,
      reportCount: 1,
      activeReportCount: isActiveClusterReport(report) ? 1 : 0,
      pendingReportCount: report.status === 'PENDING' ? 1 : 0,
      verifiedReportCount: report.status === 'VERIFIED' ? 1 : 0,
      rejectedReportCount: report.status === 'REJECTED' ? 1 : 0,
      cancelledReportCount: report.status === 'CANCELLED' ? 1 : 0,
      resolvedReportCount: report.status === 'RESOLVED' ? 1 : 0,
      highestSeverity: report.severity
    });

    return this.attachReportToCluster(report, cluster.id);
  }

  private async attachReportToCluster(report: SafeReport, clusterId: string) {
    if (report.communityReportClusterId === clusterId) {
      await this.recomputeCluster(clusterId);
      return report;
    }

    const updated = await this.reports.setCommunityReportCluster({
      reportId: report.id,
      communityReportClusterId: clusterId
    });

    if (!updated) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
    }

    await this.recomputeCluster(clusterId);
    return updated;
  }

  private async enrichClusterSummary(cluster: SafeCommunityReportClusterSummary) {
    const memberReports = await this.reports.findReportsByCommunityReportClusterId(cluster.id);
    const { all: confirmations } = await this.findConfirmationsByReport(memberReports);
    return this.applyEvidenceCounts(cluster, memberReports, confirmations);
  }

  private applyEvidenceCounts(
    cluster: SafeCommunityReportClusterSummary,
    memberReports: SafeReport[],
    confirmations: FieldConfirmation[]
  ) {
    return {
      ...cluster,
      photoEvidenceCount: memberReports.filter((report) => Boolean(report.mediaReference)).length,
      voiceEvidenceCount: memberReports.filter((report) => Boolean(report.voiceEvidence)).length,
      fieldConfirmationCount: confirmations.length
    };
  }

  private async findConfirmationsByReport(memberReports: SafeReport[]) {
    const entries = await Promise.all(memberReports.map(async (report) => [
      report.id,
      await this.confirmations.findByReportId(report.id)
    ] as const));
    const byReport = new Map<string, FieldConfirmation[]>();
    for (const [reportId, confirmations] of entries) byReport.set(reportId, confirmations);
    return { byReport, all: [...byReport.values()].flat() };
  }
}
