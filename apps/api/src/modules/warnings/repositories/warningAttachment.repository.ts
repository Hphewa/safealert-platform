import type { WarningImageMimeType } from '@safealert/contracts';

export type WarningAttachmentInfo = {
  id: string; assessmentId: string; createdById: string; mimeType: WarningImageMimeType;
};
export type StoreWarningAttachment = Omit<WarningAttachmentInfo, 'id'> & { bytes: Buffer };
export interface WarningAttachmentRepository {
  create(input: StoreWarningAttachment): Promise<WarningAttachmentInfo>;
  findById(id: string): Promise<WarningAttachmentInfo | null>;
  read(id: string): Promise<Buffer>;
}
