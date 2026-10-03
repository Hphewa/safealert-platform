import crypto from 'node:crypto';

import type { CommunityReportSummary, MonitoringReportSummary, ReportStatus, SafeReport } from '@safealert/contracts';

import type {
  CancelPendingResidentReportInput,
  CreateReportInput,
  NearbyCommunityReportsQuery,
  ReportRepository,
  ReviewReportInput,
  UpdatePendingResidentReportInput
} from './report.repository.js';
import { isSafeReportImageReference } from './reportImageEvidence.js';
import { haversineDistanceKm } from '../../../shared/geo.js';

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<string, SafeReport>();

  async createReport(input: CreateReportInput): Promise<SafeReport> {
    const now = new Date().toISOString();
    const report: SafeReport = {
      id: crypto.randomBytes(12).toString('hex'),
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

    if (input.voiceEvidence) {
      report.voiceEvidence = input.voiceEvidence;
    }

    this.reports.set(report.id, report);
    return report;
  }

  async findReportById(id: string) {
    return this.reports.get(id) ?? null;
  }

  async findReportsByResidentId(residentId: string) {
    return [...this.reports.values()]
      .filter((report) => report.residentId === residentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findReportByIdAndResidentId(reportId: string, residentId: string) {
    const report = this.reports.get(reportId);

    return report?.residentId === residentId ? report : null;
  }

  async findReportsByIds(ids: string[]) {
    const selectedIds = new Set(ids.map((id) => id.toLowerCase()));
    return [...this.reports.values()].filter((report) => selectedIds.has(report.id.toLowerCase()));
  }

  async findVerifiedImageEvidenceByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const selectedIds = new Set(ids.map(id => id.toLowerCase()));
    return [...this.reports.values()].flatMap(report => report.status === 'VERIFIED' && selectedIds.has(report.id.toLowerCase())
      && isSafeReportImageReference(report.mediaReference)
      ? [{ id: report.id, imageReference: report.mediaReference, createdAt: report.createdAt }]
      : []);
  }


  async findReportsByCommunityReportClusterId(communityReportClusterId: string) {
    return [...this.reports.values()]
      .filter((report) => report.communityReportClusterId === communityReportClusterId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((report) => structuredClone(report));
  }
  async findVerifiedSummariesByIds(ids: string[]): Promise<MonitoringReportSummary[]> {
    if (ids.length === 0) return [];
    const selectedIds = new Set(ids.map((id) => id.toLowerCase()));
    return [...this.reports.values()]
      .filter((report) => selectedIds.has(report.id.toLowerCase()) && report.status === 'VERIFIED')
      .map(({ id, description, severity, verifiedAt }) => ({
        id, description, severity, ...(verifiedAt === undefined ? {} : { verifiedAt })
      }));

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
        ...(report.communityReportClusterId ? { communityReportClusterId: report.communityReportClusterId } : {}),
        ...(report.mediaReference ? { mediaReference: report.mediaReference } : {}),
        ...(report.voiceEvidence ? { voiceEvidence: report.voiceEvidence } : {}),
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
      ...(report.communityReportClusterId ? { communityReportClusterId: report.communityReportClusterId } : {}),
      ...(report.mediaReference ? { mediaReference: report.mediaReference } : {}),
      ...(report.voiceEvidence ? { voiceEvidence: report.voiceEvidence } : {})
    };
  }

  async setCommunityReportCluster(input: { reportId: string; communityReportClusterId: string | null }) {
    const report = this.reports.get(input.reportId);
    if (!report) return null;
    const updatedReport = { ...report };
    if (input.communityReportClusterId) {
      updatedReport.communityReportClusterId = input.communityReportClusterId;
    } else {
      delete updatedReport.communityReportClusterId;
    }
    this.reports.set(updatedReport.id, updatedReport);
    return structuredClone(updatedReport);
  }

  seedReport(report: SafeReport) {
    this.reports.set(report.id, report);
  }

  async updatePendingResidentReport(input: UpdatePendingResidentReportInput) {
    const report = this.reports.get(input.reportId);

    if (!report || report.residentId !== input.residentId || report.status !== 'PENDING') {
      return null;
    }

    const { voiceEvidence, ...update } = input.update;
    const updatedReport: SafeReport = {
      ...report,
      ...update,
      updatedAt: new Date().toISOString()
    };

    if (voiceEvidence === null) {
      delete updatedReport.voiceEvidence;
    } else if (voiceEvidence) {
      updatedReport.voiceEvidence = voiceEvidence;
    }

    this.reports.set(updatedReport.id, updatedReport);
    return updatedReport;
  }

  async cancelPendingResidentReport(input: CancelPendingResidentReportInput) {
    const report = this.reports.get(input.reportId);

    if (!report || report.residentId !== input.residentId || report.status !== 'PENDING') {
      return null;
    }

    const cancelledAt = input.cancelledAt.toISOString();
    const updatedReport: SafeReport = {
      ...report,
      status: 'CANCELLED',
      updatedAt: cancelledAt,
      cancelledById: input.residentId,
      cancelledAt
    };

    this.reports.set(updatedReport.id, updatedReport);
    return updatedReport;
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
