import crypto from 'node:crypto';

import type { SafeReport } from '@safealert/contracts';

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
}
