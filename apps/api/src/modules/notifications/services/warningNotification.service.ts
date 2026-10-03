import type {
  NotificationChannel,
  NotificationProvider,
  NotificationSkipReason,
  SafeWarning,
  WarningNotificationChannelSummary,
  WarningNotificationSummary
} from '@safealert/contracts';
import { describeRecipientQuery, resolveRecipientQuery } from '../notificationTargeting.js';
import { buildWarningPushMessage, buildWarningSmsMessage, type WarningPushMessage } from '../warningNotificationContent.js';
import { toNotifyLkRecipient } from '../utils/phoneNumber.js';
import { sanitizeProviderText, truncate } from '../utils/redactSecrets.js';
import type { PushProvider } from '../providers/pushProvider.js';
import type { ProviderSendResult } from '../providers/notificationProvider.js';
import type { SmsProvider } from '../providers/smsProvider.js';
import type { DeliveryOutcome, WarningDeliveryRepository } from '../repositories/warningDelivery.repository.js';
import { emptyChannelSummary } from '../repositories/warningDelivery.repository.js';
import type { NotificationRecipient, NotificationRecipientRepository } from '../repositories/notificationRecipient.repository.js';
import type { WarningRepository } from '../../warnings/repositories/warning.repository.js';

export type WarningNotificationLogger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

export type WarningNotificationServiceOptions = {
  recipients: NotificationRecipientRepository;
  deliveries: WarningDeliveryRepository;
  warnings?: WarningRepository;
  smsProvider: SmsProvider;
  pushProvider: PushProvider;
  countryName: string;
  logger?: WarningNotificationLogger;
};

const notifiableRiskLevels = new Set<string>(['HIGH', 'CRITICAL']);

type DeliverChannelInput = {
  warningId: string;
  recipient: NotificationRecipient;
  channel: NotificationChannel;
  counters: WarningNotificationChannelSummary;
  hasContact: boolean;
  skipReason: NotificationSkipReason;
  providerConfigured: boolean;
  providerName: NotificationProvider;
  send: () => Promise<ProviderSendResult>;
};

function describeError(error: unknown) {
  return truncate(error instanceof Error ? error.message : 'Unknown error.', 200);
}

/**
 * LDFEW-127 delivery orchestration for published HIGH/CRITICAL warnings.
 *
 * Guarantees:
 * - Notifications are only attempted for a warning that is already persisted as PUBLISHED.
 * - Only active RESIDENT users resolved from the database are targeted.
 * - SMS and push are attempted independently for every recipient, and every failure is
 *   isolated so one recipient or provider failing never blocks the others.
 * - The service never throws, so it can never roll back warning publication.
 * - Duplicate warning/recipient/channel deliveries are prevented.
 */
export class WarningNotificationService {
  constructor(private readonly options: WarningNotificationServiceOptions) {}

  async retryFailedDelivery(deliveryId: string) {
    const delivery = await this.options.deliveries.findById(deliveryId);
    if (!delivery) throw new Error('NOTIFICATION_NOT_FOUND');
    if (delivery.status === 'SENT') return delivery;
    if (delivery.status !== 'FAILED') throw new Error('NOTIFICATION_NOT_RETRYABLE');
    if (!this.options.warnings) throw new Error('WARNING_NOT_PUBLISHED');
    const warning = await this.options.warnings.findById(delivery.warningId);
    if (!warning || warning.status !== 'PUBLISHED') throw new Error('WARNING_NOT_PUBLISHED');
    const recipient = await this.options.recipients.findResidentById(delivery.recipientId);
    if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');

    let result: ProviderSendResult;
    if (delivery.channel === 'SMS') {
      const to = toNotifyLkRecipient(recipient.phoneNumber);
      if (!to || !this.options.smsProvider.isConfigured()) throw new Error('NOTIFICATION_NOT_RETRYABLE');
      try { result = await this.options.smsProvider.send({ to, message: buildWarningSmsMessage(warning) }); }
      catch (error) { result = { status: 'FAILED', provider: this.options.smsProvider.name, errorCode: 'PROVIDER_REQUEST_FAILED', errorMessage: sanitizeProviderText(describeError(error), []) }; }
    } else {
      const token = recipient.pushToken?.trim();
      if (!token || !this.options.pushProvider.isConfigured()) throw new Error('NOTIFICATION_NOT_RETRYABLE');
      const message = buildWarningPushMessage(warning);
      try { result = await this.options.pushProvider.send({ token, title: message.title, body: message.body, data: message.data }); }
      catch (error) { result = { status: 'FAILED', provider: this.options.pushProvider.name, errorCode: 'PROVIDER_REQUEST_FAILED', errorMessage: sanitizeProviderText(describeError(error), []) }; }
    }
    const updated = await this.options.deliveries.retry(delivery.id, result.status === 'SENT'
      ? { expectedStatus: 'FAILED', status: 'SENT', provider: result.provider, providerMessageId: result.providerMessageId, providerStatus: result.providerStatus, sentAt: new Date().toISOString() }
      : { expectedStatus: 'FAILED', status: 'FAILED', provider: result.provider, errorCode: result.errorCode, errorMessage: result.errorMessage });
    return updated ?? (await this.options.deliveries.findById(delivery.id));
  }

  async notifyPublishedWarning(warning: SafeWarning): Promise<WarningNotificationSummary | null> {
    if (warning.status !== 'PUBLISHED') {
      this.log('warn', 'Warning notifications were skipped because the warning is not published.', {
        warningId: warning.id,
        status: warning.status
      });
      return null;
    }

    if (!notifiableRiskLevels.has(warning.riskLevel)) {
      this.log('info', 'Warning notifications were skipped for an ineligible risk level.', {
        warningId: warning.id,
        riskLevel: warning.riskLevel
      });
      return null;
    }

    const query = resolveRecipientQuery(warning, this.options.countryName);
    const summary: WarningNotificationSummary = {
      warningId: warning.id,
      riskLevel: warning.riskLevel,
      scope: query.scope,
      recipientCount: 0,
      sms: emptyChannelSummary(),
      push: emptyChannelSummary()
    };

    let recipients: NotificationRecipient[];

    try {
      recipients = await this.options.recipients.findResidents(query);
    } catch (error) {
      this.log('warn', 'Warning notification recipients could not be resolved.', {
        warningId: warning.id,
        target: describeRecipientQuery(query),
        reason: describeError(error)
      });
      return summary;
    }

    summary.recipientCount = recipients.length;

    if (recipients.length === 0) {
      // Zero eligible recipients must never fail publication.
      this.log('info', 'Warning notification found zero eligible recipients.', {
        warningId: warning.id,
        target: describeRecipientQuery(query)
      });
      return summary;
    }

    const smsMessage = buildWarningSmsMessage(warning);
    const pushMessage = buildWarningPushMessage(warning);

    for (const recipient of recipients) {
      await this.deliverSms(warning.id, recipient, smsMessage, summary.sms);
      await this.deliverPush(warning.id, recipient, pushMessage, summary.push);
    }

    this.log('info', 'Warning notification delivery finished.', {
      warningId: warning.id,
      riskLevel: warning.riskLevel,
      target: describeRecipientQuery(query),
      recipients: recipients.length,
      sms: summary.sms,
      push: summary.push
    });

    return summary;
  }

  private async deliverSms(
    warningId: string,
    recipient: NotificationRecipient,
    message: string,
    counters: WarningNotificationChannelSummary
  ) {
    const provider = this.options.smsProvider;
    const to = toNotifyLkRecipient(recipient.phoneNumber);

    await this.deliverChannel({
      warningId,
      recipient,
      channel: 'SMS',
      counters,
      hasContact: to !== null,
      skipReason: 'INVALID_OR_MISSING_PHONE',
      providerConfigured: provider.isConfigured(),
      providerName: provider.name,
      send: () => provider.send({ to: to!, message })
    });
  }

  private async deliverPush(
    warningId: string,
    recipient: NotificationRecipient,
    message: WarningPushMessage,
    counters: WarningNotificationChannelSummary
  ) {
    const provider = this.options.pushProvider;
    const token = recipient.pushToken?.trim();

    await this.deliverChannel({
      warningId,
      recipient,
      channel: 'PUSH',
      counters,
      hasContact: Boolean(token),
      skipReason: 'MISSING_PUSH_TOKEN',
      providerConfigured: provider.isConfigured(),
      providerName: provider.name,
      send: () => provider.send({
        token: token!,
        title: message.title,
        body: message.body,
        data: message.data
      })
    });
  }

  private async deliverChannel({
    warningId,
    recipient,
    channel,
    counters,
    hasContact,
    skipReason,
    providerConfigured,
    providerName,
    send
  }: DeliverChannelInput) {
    // Idempotency: a delivery record for this warning/recipient/channel already exists, so
    // the provider is never called a second time.
    const existing = await this.findExistingDelivery(warningId, recipient.id, channel);

    if (existing) {
      counters.skipped += 1;
      return;
    }

    if (!hasContact) {
      counters.skipped += 1;
      await this.record(warningId, recipient.id, channel, { status: 'SKIPPED', skipReason });
      return;
    }

    if (!providerConfigured) {
      counters.skipped += 1;
      await this.record(warningId, recipient.id, channel, { status: 'SKIPPED', skipReason: 'PROVIDER_NOT_CONFIGURED' });
      this.log('warn', 'A warning notification was skipped because its provider is not configured.', {
        warningId,
        recipientId: recipient.id,
        channel,
        provider: providerName
      });
      return;
    }

    let result: ProviderSendResult;

    try {
      result = await send();
    } catch (error) {
      // A thrown provider error is isolated to this recipient and channel.
      result = {
        status: 'FAILED',
        provider: providerName,
        errorCode: 'PROVIDER_REQUEST_FAILED',
        errorMessage: sanitizeProviderText(describeError(error), [])
      };
    }

    if (result.status === 'SENT') {
      counters.sent += 1;
      await this.record(warningId, recipient.id, channel, {
        status: 'SENT',
        provider: result.provider,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
        sentAt: new Date().toISOString()
      });
      return;
    }

    counters.failed += 1;
    await this.record(warningId, recipient.id, channel, {
      status: 'FAILED',
      provider: result.provider,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage
    });
    this.log('warn', 'A warning notification delivery failed.', {
      warningId,
      recipientId: recipient.id,
      channel,
      provider: result.provider,
      errorCode: result.errorCode
    });
  }

  private async findExistingDelivery(warningId: string, recipientId: string, channel: NotificationChannel) {
    try {
      const existing = await this.options.deliveries.find(warningId, recipientId, channel);

      if (existing) {
        this.log('info', 'An existing warning notification delivery prevented a duplicate send.', {
          warningId,
          recipientId,
          channel,
          status: existing.status
        });
      }

      return existing;
    } catch (error) {
      // A lookup failure must not stop delivery attempts; the unique index still protects
      // the delivery record.
      this.log('warn', 'Warning notification delivery history could not be read.', {
        warningId,
        channel,
        reason: describeError(error)
      });
      return null;
    }
  }

  private async record(
    warningId: string,
    recipientId: string,
    channel: NotificationChannel,
    outcome: DeliveryOutcome
  ) {
    try {
      await this.options.deliveries.createIfAbsent({ warningId, recipientId, channel, ...outcome });
    } catch (error) {
      // Recording failures never roll back publication and never hide delivery attempts.
      this.log('warn', 'A warning notification delivery record could not be saved.', {
        warningId,
        recipientId,
        channel,
        reason: describeError(error)
      });
    }
  }

  private log(level: 'info' | 'warn', message: string, meta: Record<string, unknown>) {
    const logger = this.options.logger;

    if (!logger) return;

    logger[level](message, meta);
  }
}
