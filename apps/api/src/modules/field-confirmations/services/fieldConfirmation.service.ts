import type { CreateFieldConfirmationRequest } from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { ReportService } from '../../reports/services/report.service.js';
import type { FieldConfirmationRepository } from '../repositories/fieldConfirmation.repository.js';

export class FieldConfirmationService {
  constructor(private readonly repository: FieldConfirmationRepository, private readonly reports: ReportService) {}
  async submit(reportId: string, volunteerId: string, input: CreateFieldConfirmationRequest) {
    // Use the same eligibility rules as volunteer report browsing.
    await this.reports.getCommunityReportForVolunteer(reportId);
    if (await this.repository.findByReportIdAndVolunteerId(reportId, volunteerId)) {
      throw new ApiError(409, 'FIELD_CONFIRMATION_ALREADY_EXISTS', 'You have already submitted a field confirmation for this report.');
    }

    try {
      return { confirmation: await this.repository.create({ ...input, reportId, volunteerId }) };
    } catch (error) {
      if (isDuplicateFieldConfirmationError(error)) {
        throw new ApiError(409, 'FIELD_CONFIRMATION_ALREADY_EXISTS', 'You have already submitted a field confirmation for this report.');
      }

      throw error;
    }
  }
  async listForOfficer(reportId: string) {
    await this.reports.getPendingReportForOfficer(reportId);
    return { confirmations: await this.repository.findByReportId(reportId) };
  }
  async listForVolunteer(volunteerId: string) {
    return { confirmations: await this.repository.findByVolunteerId(volunteerId) };
  }
}

function isDuplicateFieldConfirmationError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
}
