import jwt from 'jsonwebtoken';
import type { SafeWarning, UserRole } from '@safealert/contracts';
import type { ProviderSendResult } from '../providers/notificationProvider.js';
import type { SmsDeliveryRequest, SmsProvider } from '../providers/smsProvider.js';
import type { PushDeliveryRequest, PushProvider } from '../providers/pushProvider.js';
import { InMemoryNotificationRecipientRepository } from '../repositories/inMemoryNotificationRecipient.repository.js';
import { InMemoryWarningDeliveryRepository } from '../repositories/inMemoryWarningDelivery.repository.js';
import { WarningNotificationService, type WarningNotificationLogger } from '../services/warningNotification.service.js';
import type { NotificationRecipient } from '../repositories/notificationRecipient.repository.js';

export const officerId = '123456789012345678901235';
export const warningId = '507f1f77bcf86cd799439111';
export const countryName = 'Sri Lanka';

export function notificationToken(role: UserRole = 'DISASTER_OFFICER') {
  return jwt.sign({ role }, 'test-access-secret', { subject: officerId, expiresIn: '15m' });
}

export function draftWarning(overrides: Partial<SafeWarning> = {}): SafeWarning {
  const warning: SafeWarning = {
    id: warningId,
    assessmentId: '507f1f77bcf86cd799439112',
    hazardReportId: '507f1f77bcf86cd799439113',
    createdById: officerId,
    affectedArea: 'Riverside village',
    riskLevel: 'HIGH',
    requiredAction: 'Move to the community hall.',
    unsafeRoads: 'River Road bridge',
    safeRoutes: 'Hill Road',
    message: 'Flood water is rising near homes.',
    attachments: [],
    status: 'DRAFT',
    createdAt: '2026-09-26T09:00:00.000Z',
    updatedAt: '2026-09-26T09:00:00.000Z'
  };

  return Object.assign(warning, overrides);
}

export function publishedWarning(overrides: Partial<SafeWarning> = {}): SafeWarning {
  const warning = draftWarning({
    status: 'PUBLISHED',
    notificationTarget: { scope: 'AFFECTED_AREA' },
    publishedAt: '2026-09-26T10:00:00.000Z',
    publishedById: officerId,
    updatedAt: '2026-09-26T10:00:00.000Z'
  });

  return Object.assign(warning, overrides);
}

export function resident(overrides: Partial<NotificationRecipient> = {}): NotificationRecipient {
  const recipient: NotificationRecipient = {
    id: '507f1f77bcf86cd799439201',
    area: 'riversidevillage',
    district: 'colombo',
    country: 'srilanka',
    phoneNumber: '0771234567',
    pushToken: 'fcm-token-a'
  };

  return Object.assign(recipient, overrides);
}

export function sentSmsResult(overrides: Partial<Extract<ProviderSendResult, { status: 'SENT' }>> = {}): ProviderSendResult {
  const result: Extract<ProviderSendResult, { status: 'SENT' }> = {
    status: 'SENT',
    provider: 'NOTIFY_LK',
    providerStatus: 'Sent',
    providerMessageId: 'notify-lk-1'
  };

  return Object.assign(result, overrides);
}

export function failedResult(errorCode = 'PROVIDER_ERROR'): ProviderSendResult {
  return { status: 'FAILED', provider: 'NOTIFY_LK', errorCode, errorMessage: 'Provider rejected the request.' };
}

export function fakeSmsProvider(behaviour: {
  configured?: boolean;
  result?: ProviderSendResult;
  throwError?: Error;
} = {}) {
  const sent: SmsDeliveryRequest[] = [];
  const provider: SmsProvider = {
    name: 'NOTIFY_LK',
    isConfigured: () => behaviour.configured ?? true,
    send: async (request) => {
      sent.push(request);
      if (behaviour.throwError) throw behaviour.throwError;
      return behaviour.result ?? sentSmsResult();
    }
  };

  return { provider, sent };
}

export function fakePushProvider(behaviour: {
  configured?: boolean;
  result?: ProviderSendResult;
  throwError?: Error;
} = {}) {
  const sent: PushDeliveryRequest[] = [];
  const provider: PushProvider = {
    name: 'FCM',
    isConfigured: () => behaviour.configured ?? true,
    send: async (request) => {
      sent.push(request);
      if (behaviour.throwError) throw behaviour.throwError;
      return behaviour.result ?? { status: 'SENT', provider: 'FCM', providerStatus: 'OK', providerMessageId: 'projects/demo/messages/1' };
    }
  };

  return { provider, sent };
}

export type RecordedLog = { level: 'info' | 'warn'; message: string; meta: Record<string, unknown> | undefined };

export function recordingLogger() {
  const logs: RecordedLog[] = [];
  const logger: WarningNotificationLogger = {
    info: (message, meta) => { logs.push({ level: 'info', message, meta }); },
    warn: (message, meta) => { logs.push({ level: 'warn', message, meta }); }
  };

  return { logger, logs };
}

export type NotificationContextOptions = {
  countryName?: string;
  sms?: ReturnType<typeof fakeSmsProvider>;
  push?: ReturnType<typeof fakePushProvider>;
  logger?: WarningNotificationLogger;
};

export function notificationContext(options: NotificationContextOptions = {}) {
  const recipients = new InMemoryNotificationRecipientRepository();
  const deliveries = new InMemoryWarningDeliveryRepository();
  const sms = options.sms ?? fakeSmsProvider();
  const push = options.push ?? fakePushProvider();
  const service = new WarningNotificationService({
    recipients,
    deliveries,
    smsProvider: sms.provider,
    pushProvider: push.provider,
    countryName: options.countryName ?? countryName,
    ...(options.logger ? { logger: options.logger } : {})
  });

  return { service, recipients, deliveries, sms, push };
}
