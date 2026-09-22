import { randomUUID } from 'node:crypto';
import type { FieldConfirmation } from '@safealert/contracts';
import type { CreateFieldConfirmationInput, FieldConfirmationRepository } from './fieldConfirmation.repository.js';

export class InMemoryFieldConfirmationRepository implements FieldConfirmationRepository {
  private readonly confirmations: FieldConfirmation[] = [];
  async create(input: CreateFieldConfirmationInput): Promise<FieldConfirmation> {
    const confirmation: FieldConfirmation = { ...input, id: randomUUID(), status: 'PENDING', createdAt: new Date().toISOString() };
    this.confirmations.unshift(confirmation);
    return confirmation;
  }
  async findByReportId(reportId: string) {
    return this.confirmations.filter((item) => item.reportId === reportId);
  }
}
