import type {
  NotificationChannel,
  SafeWarningNotificationDelivery,
  WarningNotificationChannelSummary
} from '@safealert/contracts';

// Undefined is included explicitly so delivery outcomes built with conditional spreads can be
// forwarded with `exactOptionalPropertyTypes` enabled.
export type DeliveryOutcome = {
  status: SafeWarningNotificationDelivery['status'];
  provider?: SafeWarningNotificationDelivery['provider'] | undefined;
  providerMessageId?: string | undefined;
  providerStatus?: string | undefined;
  skipReason?: SafeWarningNotificationDelivery['skipReason'] | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  sentAt?: string | undefined;
};

export type RecordWarningDeliveryInput = DeliveryOutcome & {
  warningId: string;
  recipientId: string;
  channel: NotificationChannel;
};

export type RecordWarningDeliveryResult = {
  delivery: SafeWarningNotificationDelivery;
  created: boolean;
};
export type UpdateWarningDeliveryInput = DeliveryOutcome & { expectedStatus: 'FAILED' };

export interface WarningDeliveryRepository {
  findById(id: string): Promise<SafeWarningNotificationDelivery | null>;
  find(
    warningId: string,
    recipientId: string,
    channel: NotificationChannel
  ): Promise<SafeWarningNotificationDelivery | null>;
  listByWarning(warningId: string): Promise<SafeWarningNotificationDelivery[]>;
  /**
   * Creates the delivery record for a warning/recipient/channel triple. The unique index
   * guarantees idempotency, so an existing record is returned untouched.
   */
  createIfAbsent(input: RecordWarningDeliveryInput): Promise<RecordWarningDeliveryResult>;
  retry(id: string, input: UpdateWarningDeliveryInput): Promise<SafeWarningNotificationDelivery | null>;
}

export function emptyChannelSummary(): WarningNotificationChannelSummary {
  return { sent: 0, failed: 0, skipped: 0 };
}
