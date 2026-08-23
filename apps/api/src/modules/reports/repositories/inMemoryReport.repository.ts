import crypto from 'node:crypto';

import type { ReportStatus, SafeReport } from '@safealert/contracts';

import type { CreateReportInput, ReportRepository } from './report.repository.js';

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

  findReportById(id: string) {
    return this.reports.get(id) ?? null;
  }

  async findReportsByStatuses(statuses: ReportStatus[]) {
    return [...this.reports.values()]
      .filter((report) => statuses.includes(report.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  seedReport(report: SafeReport) {
    this.reports.set(report.id, report);
  }
}
