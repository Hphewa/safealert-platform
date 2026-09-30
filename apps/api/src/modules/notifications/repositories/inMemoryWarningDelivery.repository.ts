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
      ,attemptCount: 1,
      attempts: [{ attempt: 1, status: delivery.status, attemptedAt: timestamp }]
    });
  }

  async find(warningId: string, recipientId: string, channel: NotificationChannel) {
    return structuredClone(this.deliveries.get(deliveryKey(warningId, recipientId, channel)) ?? null);
  }

  async findById(id: string) {
    const delivery = [...this.deliveries.values()].find((item) => item.id === id);
    return delivery ? structuredClone(delivery) : null;
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
      updatedAt: timestamp,
      attemptCount: 1,
      attempts: [{ attempt: 1, status: input.status, attemptedAt: timestamp, ...(input.provider ? { provider: input.provider } : {}) }]
    };

    this.deliveries.set(key, delivery);

    return { delivery: structuredClone(delivery), created: true };
  }

  async retry(id: string, input: import('./warningDelivery.repository.js').UpdateWarningDeliveryInput) {
    const current = [...this.deliveries.values()].find((delivery) => delivery.id === id);
    if (!current || current.status !== input.expectedStatus) return null;
    const timestamp = new Date().toISOString();
    const updated = { ...current, status: input.status, attemptCount: current.attemptCount + 1, attempts: [...current.attempts, { attempt: current.attemptCount + 1, status: input.status, attemptedAt: timestamp, ...(input.provider ? { provider: input.provider } : {}), ...(input.errorCode ? { errorCode: input.errorCode } : {}) }], updatedAt: timestamp, ...(input.sentAt ? { sentAt: input.sentAt } : {}), ...(input.provider ? { provider: input.provider } : {}), ...(input.providerStatus ? { providerStatus: input.providerStatus } : {}), ...(input.errorCode ? { errorCode: input.errorCode } : {}), ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}) };
    this.deliveries.set(deliveryKey(current.warningId, current.recipientId, current.channel), updated);
    return structuredClone(updated);
  }
}
