import type { CreateReportRequest, SafeReport } from '@safealert/contracts';

export type CreateReportInput = CreateReportRequest & {
  residentId: string;
  status: 'PENDING';
};

export interface ReportRepository {
  createReport(input: CreateReportInput): Promise<SafeReport>;
}
