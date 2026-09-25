import crypto from 'node:crypto';

import type { CommunityReportSummary, ReportStatus, SafeReport } from '@safealert/contracts';

import type {
  CreateReportInput,
  NearbyCommunityReportsQuery,
  ReportRepository,
  ReviewReportInput
} from './report.repository.js';
import { haversineDistanceKm } from '../../../shared/geo.js';

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<string, SafeReport>();

  async createReport(input: CreateReportInput): Promise<SafeReport> {
    const now = new Date().toISOString();
    const report: SafeReport = {
      id: crypto.randomUUID(),
      residentId: input.residentId,
      hazardType: input.hazardType,
      description: input.description,
      severity: input.severity,
      location: input.location,
      status: input.status,
      createdAt: now,
      updatedAt: now
    };

    if (input.mediaReference) {
      report.mediaReference = input.mediaReference;
    }

    this.reports.set(report.id, report);
    return report;
  }

  async findReportById(id: string) {
    return this.reports.get(id) ?? null;
  }

  async findReportsByIds(ids: string[]) {
    const selectedIds = new Set(ids.map((id) => id.toLowerCase()));
    return [...this.reports.values()].filter((report) => selectedIds.has(report.id.toLowerCase()));
  }

  async findReportsByStatuses(statuses: ReportStatus[]) {
    return [...this.reports.values()]
      .filter((report) => statuses.includes(report.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findNearbyCommunityReports(query: NearbyCommunityReportsQuery): Promise<CommunityReportSummary[]> {
    return [...this.reports.values()]
      .filter((report) => query.statuses.includes(report.status))
      .map((report) => ({
        report,
        distanceKm: haversineDistanceKm(
          query.latitude,
          query.longitude,
          report.location.coordinates[1],
          report.location.coordinates[0]
        )
      }))
      .filter((entry) => entry.distanceKm <= query.radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .map(({ report, distanceKm }) => ({
        id: report.id,
        hazardType: report.hazardType,
        description: report.description,
        severity: report.severity,
        location: report.location,
        status: report.status,
        createdAt: report.createdAt,
        ...(report.mediaReference ? { mediaReference: report.mediaReference } : {}),
        distanceKm: Number(distanceKm.toFixed(2))
      }));
  }

  async findCommunityReportById(reportId: string, statuses: ReportStatus[]) {
    const report = this.reports.get(reportId);

    if (!report || !statuses.includes(report.status)) {
      return null;
    }

    return {
      id: report.id,
      hazardType: report.hazardType,
      description: report.description,
      severity: report.severity,
      location: report.location,
      status: report.status,
      createdAt: report.createdAt,
      ...(report.mediaReference ? { mediaReference: report.mediaReference } : {})
    };
  }

  seedReport(report: SafeReport) {
    this.reports.set(report.id, report);
  }

  async reviewReport(input: ReviewReportInput) {
    const report = this.reports.get(input.reportId);

    if (!report || report.status !== 'PENDING') {
      return null;
    }

    const reviewedAt = input.reviewedAt.toISOString();
    const updatedReport: SafeReport =
      input.action === 'VERIFY'
        ? {
            ...report,
            status: 'VERIFIED',
            updatedAt: reviewedAt,
            verifiedById: input.officerId,
            verifiedAt: reviewedAt,
            verificationHistory: [
              ...(report.verificationHistory ?? []),
              {
                action: 'VERIFY',
                verifiedById: input.officerId,
                verifiedAt: reviewedAt
              }
            ]
          }
        : {
            ...report,
            status: 'REJECTED',
            updatedAt: reviewedAt,
            rejectedById: input.officerId,
            rejectedAt: reviewedAt,
            rejectionReason: input.rejectionReason,
            verificationHistory: [
              ...(report.verificationHistory ?? []),
              {
                action: 'REJECT',
                rejectedById: input.officerId,
                rejectedAt: reviewedAt,
                rejectionReason: input.rejectionReason
              }
            ]
          };

    this.reports.set(updatedReport.id, updatedReport);
    return updatedReport;
  }
}
