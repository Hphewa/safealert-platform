import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StoreWarningAttachment, WarningAttachmentInfo, WarningAttachmentRepository } from './warningAttachment.repository.js';

// Reuse the application's MongoDB connection. Image bytes are GridFS chunks, not warning documents.
export class GridFsWarningAttachmentRepository implements WarningAttachmentRepository {
  private bucket() {
    const db = mongoose.connection.db;
    if (!db) throw new Error('The database connection is unavailable.');
    return new mongoose.mongo.GridFSBucket(db, { bucketName: 'warningImages' });
  }
  async create({ bytes, ...metadata }: StoreWarningAttachment): Promise<WarningAttachmentInfo> {
    const stream = this.bucket().openUploadStream('warning-image', { metadata });
    try {
      await pipeline(Readable.from([bytes]), stream);
    } catch (error) {
      await stream.abort().catch(() => undefined);
      throw error;
    }
    return { id: stream.id.toString(), ...metadata };
  }
  async findById(id: string): Promise<WarningAttachmentInfo | null> {
    const file = await this.bucket().find({ _id: new mongoose.Types.ObjectId(id) }).next();
    if (!file?.metadata) return null;
    return { id: file._id.toString(), assessmentId: file.metadata.assessmentId,
      createdById: file.metadata.createdById, mimeType: file.metadata.mimeType };
  }
  async read(id: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.bucket().openDownloadStream(new mongoose.Types.ObjectId(id))) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
}
