import { randomBytes } from 'node:crypto';
import type { StoreWarningAttachment, WarningAttachmentInfo, WarningAttachmentRepository } from './warningAttachment.repository.js';

export class InMemoryWarningAttachmentRepository implements WarningAttachmentRepository {
  readonly images = new Map<string, StoreWarningAttachment>();
  async create(input: StoreWarningAttachment): Promise<WarningAttachmentInfo> {
    const id = randomBytes(12).toString('hex');
    this.images.set(id, input);
    return { id, assessmentId: input.assessmentId, createdById: input.createdById, mimeType: input.mimeType };
  }
  async findById(id: string): Promise<WarningAttachmentInfo | null> {
    const input = this.images.get(id);
    return input ? { id, assessmentId: input.assessmentId, createdById: input.createdById, mimeType: input.mimeType } : null;
  }
  async read(id: string) { return Buffer.from(this.images.get(id)!.bytes); }
}
