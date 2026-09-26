import type { CreateFieldConfirmationRequest, FieldConfirmation } from '@safealert/contracts';

export type CreateFieldConfirmationInput = CreateFieldConfirmationRequest & {
  reportId: string;
  volunteerId: string;
};
export interface FieldConfirmationRepository {
  create(input: CreateFieldConfirmationInput): Promise<FieldConfirmation>;
  findByReportId(reportId: string): Promise<FieldConfirmation[]>;
  findByVolunteerId(volunteerId: string): Promise<FieldConfirmation[]>;
  findByReportIdAndVolunteerId(reportId: string, volunteerId: string): Promise<FieldConfirmation | null>;
}
