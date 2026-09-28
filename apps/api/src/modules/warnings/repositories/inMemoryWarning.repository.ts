import { randomBytes } from 'node:crypto';
import type { SafeWarning, WarningNotificationTarget } from '@safealert/contracts';
import type { CreateWarningInput, WarningRepository } from './warning.repository.js';

export class InMemoryWarningRepository implements WarningRepository {
  readonly warnings = new Map<string, SafeWarning>();
  async create(input: CreateWarningInput): Promise<SafeWarning> {
    const timestamp = new Date().toISOString();
    const warning = { ...input, id: randomBytes(12).toString('hex'), createdAt: timestamp, updatedAt: timestamp };
    this.warnings.set(warning.id, warning);
    return warning;
  }
  async findById(id: string) { return structuredClone(this.warnings.get(id) ?? null); }
  async findByAssessmentId(assessmentId: string) {
    const warning = [...this.warnings.values()].find(item => item.assessmentId === assessmentId);
    return structuredClone(warning ?? null);
  }
  async publish(id: string, publishedById: string, publishedAt: string, notificationTarget: WarningNotificationTarget) {
    const warning = this.warnings.get(id);
    if (!warning) return null;
    const updated = { ...warning, status: 'PUBLISHED' as const, publishedAt, publishedById, notificationTarget, updatedAt: publishedAt };
    this.warnings.set(id, updated);
    return structuredClone(updated);
  }
}
