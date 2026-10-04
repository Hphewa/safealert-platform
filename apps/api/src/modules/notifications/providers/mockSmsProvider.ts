import { randomUUID } from 'node:crypto';
import { truncate } from '../utils/redactSecrets.js';
import type { ProviderSendResult } from './notificationProvider.js';
import type { SmsDeliveryRequest, SmsProvider } from './smsProvider.js';

/**
 * Development/test SMS provider used when NOTIFICATION_SMS_MOCK_ENABLED=true.
 * It never contacts a real provider and records nothing but the sanitized message text.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'MOCK' as const;
  readonly sentMessages: { to: string; message: string }[] = [];

  isConfigured() {
    return true;
  }

  async send({ to, message }: SmsDeliveryRequest): Promise<ProviderSendResult> {
    this.sentMessages.push({ to, message: truncate(message, 621) });

    return {
      status: 'SENT',
      provider: this.name,
      providerStatus: 'Sent',
      providerMessageId: `mock-sms-${randomUUID()}`
    };
  }
}