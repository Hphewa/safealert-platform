import { randomUUID } from 'node:crypto';
import type { FieldConfirmation } from '@safealert/contracts';
import type { CreateFieldConfirmationInput, FieldConfirmationRepository } from './fieldConfirmation.repository.js';

export class InMemoryFieldConfirmationRepository implements FieldConfirmationRepository {
  private readonly confirmations: FieldConfirmation[] = [];
  async create(input: CreateFieldConfirmationInput): Promise<FieldConfirmation> {
    const now = new Date().toISOString();
    const confirmation: FieldConfirmation = { ...input, id: randomUUID(), status: 'PENDING', createdAt: now, updatedAt: now };
    this.confirmations.unshift(confirmation);
    return confirmation;
  }
  async findByReportId(reportId: string) {
    return this.confirmations.filter((item) => item.reportId === reportId);
  }
  async findByVolunteerId(volunteerId: string) {
    return this.confirmations.filter((item) => item.volunteerId === volunteerId);
  }
  async findByReportIdAndVolunteerId(reportId: string, volunteerId: string) {
    return this.confirmations.find((item) => item.reportId === reportId && item.volunteerId === volunteerId) ?? null;
  }
}
