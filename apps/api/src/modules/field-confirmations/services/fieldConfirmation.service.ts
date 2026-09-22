import type { CreateFieldConfirmationRequest } from '@safealert/contracts';
import type { ReportService } from '../../reports/services/report.service.js';
import type { FieldConfirmationRepository } from '../repositories/fieldConfirmation.repository.js';

export class FieldConfirmationService {
  constructor(private readonly repository: FieldConfirmationRepository, private readonly reports: ReportService) {}
  async submit(reportId: string, volunteerId: string, input: CreateFieldConfirmationRequest) {
    // Use the same eligibility rules as volunteer report browsing.
    await this.reports.getCommunityReportForVolunteer(reportId);
    return { confirmation: await this.repository.create({ ...input, reportId, volunteerId }) };
  }
  async listForOfficer(reportId: string) {
    await this.reports.getPendingReportForOfficer(reportId);
    return { confirmations: await this.repository.findByReportId(reportId) };
  }
  async listForVolunteer(volunteerId: string) {
    return { confirmations: await this.repository.findByVolunteerId(volunteerId) };
  }
}
