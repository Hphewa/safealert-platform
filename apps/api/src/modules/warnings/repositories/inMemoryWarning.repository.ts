import { randomBytes } from 'node:crypto';
import type { SafeWarning, WarningNotificationTarget } from '@safealert/contracts';
import type { CreateWarningInput, UpdateWarningInput, WarningRepository } from './warning.repository.js';

// LDFEW-115: every repository mutation re-checks the persisted status so a
// stale read can never apply an invalid lifecycle transition.
const canEdit = (status: SafeWarning['status']) => status === 'DRAFT' || status === 'PUBLISHED';
const canCancel = (status: SafeWarning['status']) => status === 'DRAFT' || status === 'PUBLISHED';
const canArchive = (status: SafeWarning['status']) => status !== 'ARCHIVED';

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
  async findByAssessmentIds(assessmentIds: string[]) {
    if (assessmentIds.length === 0) return [];
    const requested = new Set(assessmentIds);
    return [...this.warnings.values()]
      .filter(({ assessmentId }) => requested.has(assessmentId))
      .map((warning) => structuredClone(warning));
  }
  async publish(id: string, publishedById: string, publishedAt: string, notificationTarget: WarningNotificationTarget) {
    const warning = this.warnings.get(id);
    if (!warning) return null;
    // LDFEW-115: only a DRAFT can be published; CANCELLED/ARCHIVED are terminal
    // and must never become published again (mirrors the Mongoose status guard).
    if (warning.status !== 'DRAFT') return null;
    const updated = { ...warning, status: 'PUBLISHED' as const, publishedAt, publishedById, notificationTarget, updatedAt: publishedAt };
    this.warnings.set(id, updated);
    return structuredClone(updated);
  }
  async update(id: string, changes: UpdateWarningInput) {
    const warning = this.warnings.get(id);
    if (!warning || !canEdit(warning.status)) return null;
    const updated = { ...warning, ...changes, updatedAt: new Date().toISOString() };
    this.warnings.set(id, updated);
    return structuredClone(updated);
  }
  async cancel(id: string, cancelledById: string, cancelledAt: string) {
    const warning = this.warnings.get(id);
    if (!warning || !canCancel(warning.status)) return null;
    const updated = { ...warning, status: 'CANCELLED' as const, cancelledById, cancelledAt, updatedAt: cancelledAt };
    this.warnings.set(id, updated);
    return structuredClone(updated);
  }
  async archive(id: string, archivedById: string, archivedAt: string) {
    const warning = this.warnings.get(id);
    if (!warning || !canArchive(warning.status)) return null;
    const updated = { ...warning, status: 'ARCHIVED' as const, archivedById, archivedAt, updatedAt: archivedAt };
    this.warnings.set(id, updated);
    return structuredClone(updated);
  }
}

