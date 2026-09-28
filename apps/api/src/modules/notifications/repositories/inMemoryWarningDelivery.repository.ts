import { randomBytes } from 'node:crypto';
import type { NotificationChannel, SafeWarningNotificationDelivery } from '@safealert/contracts';
import type {
  RecordWarningDeliveryInput,
  RecordWarningDeliveryResult,
  WarningDeliveryRepository
} from './warningDelivery.repository.js';

const deliveryKey = (warningId: string, recipientId: string, channel: NotificationChannel) =>
  `${warningId}:${recipientId}:${channel}`;

export class InMemoryWarningDeliveryRepository implements WarningDeliveryRepository {
  readonly deliveries = new Map<string, SafeWarningNotificationDelivery>();

  seedDelivery(delivery: { warningId: string; recipientId: string; channel: NotificationChannel; status: SafeWarningNotificationDelivery['status'] }) {
    const timestamp = new Date().toISOString();
    this.deliveries.set(deliveryKey(delivery.warningId, delivery.recipientId, delivery.channel), {
      id: randomBytes(12).toString('hex'),
      ...delivery,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async find(warningId: string, recipientId: string, channel: NotificationChannel) {
    return structuredClone(this.deliveries.get(deliveryKey(warningId, recipientId, channel)) ?? null);
  }

  async listByWarning(warningId: string) {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.warningId === warningId)
      .map((delivery) => structuredClone(delivery));
  }

  async createIfAbsent(input: RecordWarningDeliveryInput): Promise<RecordWarningDeliveryResult> {
    const key = deliveryKey(input.warningId, input.recipientId, input.channel);
    const existing = this.deliveries.get(key);

    if (existing) return { delivery: structuredClone(existing), created: false };

    const timestamp = new Date().toISOString();
    const delivery: SafeWarningNotificationDelivery = {
      id: randomBytes(12).toString('hex'),
      warningId: input.warningId,
      recipientId: input.recipientId,
      channel: input.channel,
      status: input.status,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
      ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}),
      ...(input.skipReason ? { skipReason: input.skipReason } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      ...(input.sentAt ? { sentAt: input.sentAt } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.deliveries.set(key, delivery);

    return { delivery: structuredClone(delivery), created: true };
  }
}