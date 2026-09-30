import type { NotificationChannel } from '@safealert/contracts';
import { toSafeWarningDelivery, WarningDeliveryModel } from '../models/warningDelivery.model.js';
import type {
  RecordWarningDeliveryInput,
  RecordWarningDeliveryResult,
  UpdateWarningDeliveryInput,
  WarningDeliveryRepository
} from './warningDelivery.repository.js';

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export class MongooseWarningDeliveryRepository implements WarningDeliveryRepository {
  async findById(id: string) {
    const delivery = await WarningDeliveryModel.findById(id).exec();
    return delivery ? toSafeWarningDelivery(delivery) : null;
  }
  async find(warningId: string, recipientId: string, channel: NotificationChannel) {
    const delivery = await WarningDeliveryModel.findOne({ warningId, recipientId, channel }).exec();
    return delivery ? toSafeWarningDelivery(delivery) : null;
  }

  async listByWarning(warningId: string) {
    const deliveries = await WarningDeliveryModel.find({ warningId }).sort({ createdAt: 1 }).exec();
    return deliveries.map(toSafeWarningDelivery);
  }

  async createIfAbsent(input: RecordWarningDeliveryInput): Promise<RecordWarningDeliveryResult> {
    try {
      const created = await WarningDeliveryModel.create({
        ...input,
        ...(input.sentAt ? { sentAt: new Date(input.sentAt) } : {})
      } as never);

      return { delivery: toSafeWarningDelivery(created), created: true };
    } catch (error) {
      // The unique warning/recipient/channel index is the idempotency boundary.
      if (isDuplicateKeyError(error)) {
        const existing = await WarningDeliveryModel
        .findOne({ warningId: input.warningId, recipientId: input.recipientId, channel: input.channel } as never)
          .exec();

        if (existing) return { delivery: toSafeWarningDelivery(existing), created: false };
      }

      throw error;
    }
  }

  async retry(id: string, input: UpdateWarningDeliveryInput) {
    const current = await WarningDeliveryModel.findOneAndUpdate(
      { _id: id, status: input.expectedStatus },
      { $set: { status: input.status, ...(input.provider ? { provider: input.provider } : {}), ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}), ...(input.errorCode ? { errorCode: input.errorCode } : {}), ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}), ...(input.sentAt ? { sentAt: new Date(input.sentAt) } : {}) }, $inc: { attemptCount: 1 }, $push: { attempts: { attempt: 2, status: input.status, attemptedAt: new Date(), ...(input.provider ? { provider: input.provider } : {}), ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}), ...(input.errorCode ? { errorCode: input.errorCode } : {}), ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}) } } },
      { new: true }
    ).exec();
    return current ? toSafeWarningDelivery(current) : null;
  }
}
