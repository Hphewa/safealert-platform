import type { CreateReportRequest, ReportStatus, SafeReport } from '@safealert/contracts';

export type CreateReportInput = CreateReportRequest & {
  residentId: string;
  status: 'PENDING';
};

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
  findReportsByStatuses(statuses: ReportStatus[]): Promise<SafeReport[]>;
}
