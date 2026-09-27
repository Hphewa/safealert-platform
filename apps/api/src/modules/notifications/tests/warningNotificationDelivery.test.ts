import { describe, expect, it } from 'vitest';
import { NOTIFICATION_SMS_MAX_LENGTH, type SafeWarning } from '@safealert/contracts';
import { NotifyLkSmsProvider } from '../providers/notifyLkSmsProvider.js';
import { buildWarningPushMessage, buildWarningSmsMessage } from '../warningNotificationContent.js';
import {
  fakePushProvider,
  fakeSmsProvider,
  failedResult,
  notificationContext,
  publishedWarning,
  recordingLogger
} from './notification.fixtures.js';

type RecipientStore = ReturnType<typeof notificationContext>['recipients'];

function seedResident(recipients: RecipientStore, overrides: Partial<Parameters<RecipientStore['seedResident']>[0]> = {}) {
  recipients.seedResident(Object.assign({
    id: 'resident-a',
    area: 'Riverside Village',
    district: 'Colombo',
    country: 'Sri Lanka',
    phoneNumber: '0771234567',
    pushToken: 'fcm-token-a'
  }, overrides));
}

describe('LDFEW-127 published warning notification delivery', () => {
  it.each(['HIGH', 'CRITICAL'] as const)('sends SMS and PUSH for a published %s warning', async (riskLevel) => {
    const context = notificationContext();
    const warning = publishedWarning({ riskLevel });
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({
      riskLevel,
      scope: 'AFFECTED_AREA',
      recipientCount: 1,
      sms: { sent: 1, failed: 0, skipped: 0 },
      push: { sent: 1, failed: 0, skipped: 0 }
    });
    expect(context.sms.sent).toEqual([{ to: '94771234567', message: buildWarningSmsMessage(warning) }]);
    expect(context.push.sent).toEqual([{
      token: 'fcm-token-a',
      title: `SAFEALERT - ${riskLevel} WARNING`,
      body: buildWarningPushMessage(warning).body,
      data: { warningId: warning.id, riskLevel, affectedArea: 'Riverside village' }
    }]);

    const deliveries = await context.deliveries.listByWarning(warning.id);
    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'SMS', status: 'SENT', provider: 'NOTIFY_LK', providerStatus: 'Sent', sentAt: expect.any(String) }),
      expect.objectContaining({ channel: 'PUSH', status: 'SENT', provider: 'FCM', providerStatus: 'OK', sentAt: expect.any(String) })
    ]));
  });

  it.each(['LOW', 'MODERATE'] as const)('sends nothing for a %s warning', async (riskLevel) => {
    const context = notificationContext();
    // LOW and MODERATE can never be persisted for a warning, so the service guard is asserted directly.
    const warning = { ...publishedWarning(), riskLevel } as unknown as SafeWarning;
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toBeNull();
    expect(context.sms.sent).toHaveLength(0);
    expect(context.push.sent).toHaveLength(0);
    expect(await context.deliveries.listByWarning(warning.id)).toHaveLength(0);
  });

  it('never notifies a warning that is not persisted as PUBLISHED', async () => {
    const context = notificationContext();
    const warning = publishedWarning({ status: 'DRAFT' });
    seedResident(context.recipients);

    expect(await context.service.notifyPublishedWarning(warning)).toBeNull();
    expect(context.sms.sent).toHaveLength(0);
    expect(context.push.sent).toHaveLength(0);
    expect(await context.deliveries.listByWarning(warning.id)).toHaveLength(0);
  });

  it('targets only residents whose persisted area matches the affected area', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-match', area: '  riverside   VILLAGE ' });
    seedResident(context.recipients, { id: 'resident-other-area', area: 'Hill Town' });
    seedResident(context.recipients, { id: 'resident-no-area', area: null });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary?.recipientCount).toBe(1);
    const deliveries = await context.deliveries.listByWarning(warning.id);
    expect(deliveries.map((delivery) => delivery.recipientId)).toEqual(['resident-match', 'resident-match']);
  });

  it('targets only residents whose persisted district matches the selected district', async () => {
    const context = notificationContext();
    const warning = publishedWarning({ notificationTarget: { scope: 'DISTRICT', district: 'Colombo' } });
    seedResident(context.recipients, { id: 'resident-colombo', district: '  colombo ' });
    seedResident(context.recipients, { id: 'resident-galle', district: 'Galle' });
    seedResident(context.recipients, { id: 'resident-no-district', district: null });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ scope: 'DISTRICT', recipientCount: 1 });
    const deliveries = await context.deliveries.listByWarning(warning.id);
    expect(deliveries.every((delivery) => delivery.recipientId === 'resident-colombo')).toBe(true);
  });

  it('targets only residents whose saved country matches', async () => {
    const context = notificationContext();
    const warning = publishedWarning({ notificationTarget: { scope: 'WHOLE_COUNTRY' } });
    seedResident(context.recipients, { id: 'resident-lk', country: 'sri lanka' });
    seedResident(context.recipients, { id: 'resident-unknown-country', country: null });
    seedResident(context.recipients, { id: 'resident-abroad', country: 'India' });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ scope: 'WHOLE_COUNTRY', recipientCount: 1 });
    expect(context.sms.sent).toHaveLength(1);
  });

  it('never targets non-resident or inactive accounts', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-active' });
    seedResident(context.recipients, { id: 'resident-inactive', isActive: false });
    seedResident(context.recipients, { id: 'volunteer', role: 'COMMUNITY_VOLUNTEER' });
    seedResident(context.recipients, { id: 'officer', role: 'DISASTER_OFFICER' });
    seedResident(context.recipients, { id: 'responder', role: 'EMERGENCY_RESPONDER' });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary?.recipientCount).toBe(1);
    const deliveries = await context.deliveries.listByWarning(warning.id);
    expect(new Set(deliveries.map((delivery) => delivery.recipientId))).toEqual(new Set(['resident-active']));
  });

  it.each([null, 'not-a-number', '0112345678'] as const)(
    'skips SMS with INVALID_OR_MISSING_PHONE for phone %s while still sending push',
    async (phoneNumber) => {
      const context = notificationContext();
      const warning = publishedWarning();
      seedResident(context.recipients, { id: 'resident-a', phoneNumber });

      const summary = await context.service.notifyPublishedWarning(warning);

      expect(summary).toMatchObject({ sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } });
      expect(context.sms.sent).toHaveLength(0);
      const smsDelivery = await context.deliveries.find(warning.id, 'resident-a', 'SMS');
      expect(smsDelivery).toMatchObject({ status: 'SKIPPED', skipReason: 'INVALID_OR_MISSING_PHONE' });
      expect(smsDelivery).not.toHaveProperty('provider');
    }
  );

  it('normalizes a stored phone number before handing it to the SMS provider', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-a', phoneNumber: '+94 77 123 4567' });

    await context.service.notifyPublishedWarning(warning);

    expect(context.sms.sent.map((request) => request.to)).toEqual(['94771234567']);
  });

  it('skips push with MISSING_PUSH_TOKEN while still sending SMS', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-a', pushToken: null });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 1, failed: 0, skipped: 0 }, push: { sent: 0, failed: 0, skipped: 1 } });
    expect(context.push.sent).toHaveLength(0);
    expect(await context.deliveries.find(warning.id, 'resident-a', 'PUSH'))
      .toMatchObject({ status: 'SKIPPED', skipReason: 'MISSING_PUSH_TOKEN' });
  });

  it('skips SMS with PROVIDER_NOT_CONFIGURED when Notify.lk is not configured', async () => {
    const sms = fakeSmsProvider({ configured: false });
    const context = notificationContext({ sms });
    const warning = publishedWarning();
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } });
    expect(sms.sent).toHaveLength(0);
    expect(await context.deliveries.find(warning.id, 'resident-a', 'SMS'))
      .toMatchObject({ status: 'SKIPPED', skipReason: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('skips push with PROVIDER_NOT_CONFIGURED when Firebase is not configured', async () => {
    const push = fakePushProvider({ configured: false });
    const context = notificationContext({ push });
    const warning = publishedWarning();
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 1, failed: 0, skipped: 0 }, push: { sent: 0, failed: 0, skipped: 1 } });
    expect(push.sent).toHaveLength(0);
    expect(await context.deliveries.find(warning.id, 'resident-a', 'PUSH'))
      .toMatchObject({ status: 'SKIPPED', skipReason: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('records a failed SMS while still sending push and keeping the warning published', async () => {
    const context = notificationContext({ sms: fakeSmsProvider({ result: failedResult('INSUFFICIENT_BALANCE') }) });
    const warning = publishedWarning();
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 0, failed: 1, skipped: 0 }, push: { sent: 1, failed: 0, skipped: 0 } });
    expect(await context.deliveries.find(warning.id, 'resident-a', 'SMS')).toMatchObject({
      status: 'FAILED',
      provider: 'NOTIFY_LK',
      errorCode: 'INSUFFICIENT_BALANCE',
      errorMessage: 'Provider rejected the request.'
    });
    expect(warning.status).toBe('PUBLISHED');
  });

  it('records a failed push while still sending SMS and keeping the warning published', async () => {
    const context = notificationContext({
      push: fakePushProvider({ result: { status: 'FAILED', provider: 'FCM', errorCode: 'UNREGISTERED', errorMessage: 'Requested entity was not found.' } })
    });
    const warning = publishedWarning();
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 1, failed: 0, skipped: 0 }, push: { sent: 0, failed: 1, skipped: 0 } });
    expect(await context.deliveries.find(warning.id, 'resident-a', 'PUSH')).toMatchObject({
      status: 'FAILED',
      provider: 'FCM',
      errorCode: 'UNREGISTERED'
    });
    expect(warning.status).toBe('PUBLISHED');
  });

  it('isolates failures per resident and per channel', async () => {
    const context = notificationContext({
      sms: fakeSmsProvider({ result: failedResult('SMS_PROVIDER_DOWN') }),
      push: fakePushProvider({ result: { status: 'FAILED', provider: 'FCM', errorCode: 'UNREGISTERED', errorMessage: 'Token is unknown.' } })
    });
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-a', phoneNumber: '0771234567', pushToken: 'fcm-token-a' });
    seedResident(context.recipients, { id: 'resident-b', phoneNumber: '0771234568', pushToken: 'fcm-token-b' });
    seedResident(context.recipients, { id: 'resident-c', phoneNumber: null, pushToken: 'fcm-token-c' });

    const summary = await context.service.notifyPublishedWarning(warning);

    // resident-a: SMS FAILED / PUSH FAILED, resident-b: SMS FAILED / PUSH FAILED,
    // resident-c: SMS SKIPPED / PUSH FAILED. Every attempt is still recorded independently.
    expect(summary).toMatchObject({
      recipientCount: 3,
      sms: { sent: 0, failed: 2, skipped: 1 },
      push: { sent: 0, failed: 3, skipped: 0 }
    });
    expect(context.sms.sent.map((request) => request.to)).toEqual(['94771234567', '94771234568']);
    expect(await context.deliveries.listByWarning(warning.id)).toHaveLength(6);
    expect(warning.status).toBe('PUBLISHED');
  });

  it('records a thrown provider error as FAILED without affecting the other channel', async () => {
    const context = notificationContext({ sms: fakeSmsProvider({ throwError: new Error('socket hang up') }) });
    const warning = publishedWarning();
    seedResident(context.recipients);

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 0, failed: 1, skipped: 0 }, push: { sent: 1, failed: 0, skipped: 0 } });
    expect(await context.deliveries.find(warning.id, 'resident-a', 'SMS')).toMatchObject({
      status: 'FAILED',
      provider: 'NOTIFY_LK',
      errorCode: 'PROVIDER_REQUEST_FAILED',
      errorMessage: 'socket hang up'
    });
  });

  it('does not send a duplicate SMS or PUSH when publication is triggered twice', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients);

    const first = await context.service.notifyPublishedWarning(warning);
    const second = await context.service.notifyPublishedWarning(warning);

    expect(first).toMatchObject({ sms: { sent: 1 }, push: { sent: 1 } });
    expect(second).toMatchObject({ sms: { sent: 0, skipped: 1 }, push: { sent: 0, skipped: 1 } });
    expect(context.sms.sent).toHaveLength(1);
    expect(context.push.sent).toHaveLength(1);
    expect(await context.deliveries.listByWarning(warning.id)).toHaveLength(2);
  });

  it('honours an existing delivery record for a fresh service instance', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients);
    context.deliveries.seedDelivery({ warningId: warning.id, recipientId: 'resident-a', channel: 'SMS', status: 'SENT' });

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } });
    expect(context.sms.sent).toHaveLength(0);
  });

  it('reports zero eligible recipients without failing', async () => {
    const context = notificationContext();
    const warning = publishedWarning();

    const summary = await context.service.notifyPublishedWarning(warning);

    expect(summary).toMatchObject({ recipientCount: 0, sms: { sent: 0, failed: 0, skipped: 0 }, push: { sent: 0, failed: 0, skipped: 0 } });
    expect(context.sms.sent).toHaveLength(0);
    expect(context.push.sent).toHaveLength(0);
    expect(await context.deliveries.listByWarning(warning.id)).toHaveLength(0);
  });

  it('builds SMS and push content from persisted warning data only', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    seedResident(context.recipients);

    await context.service.notifyPublishedWarning(warning);

    const smsMessage = context.sms.sent[0]?.message ?? '';
    expect(smsMessage).toContain('SAFEALERT - HIGH WARNING');
    expect(smsMessage).toContain('Affected Area: Riverside village');
    expect(smsMessage).toContain('Flood water is rising near homes.');
    expect(smsMessage).toContain('Required Action:\nMove to the community hall.');
    expect(smsMessage).toContain('Unsafe Roads:\nRiver Road bridge');
    expect(smsMessage).toContain('Safe Routes:\nHill Road');
    expect(smsMessage.length).toBeLessThanOrEqual(NOTIFICATION_SMS_MAX_LENGTH);

    const pushTitle = context.push.sent[0]?.title ?? '';
    const pushBody = context.push.sent[0]?.body ?? '';
    expect(pushTitle).toBe('SAFEALERT - HIGH WARNING');
    expect(pushBody).toBe('Riverside village\nFlood water is rising near homes.\nMove to the community hall.');
    expect(context.push.sent[0]?.data).toEqual({
      warningId: warning.id,
      riskLevel: 'HIGH',
      affectedArea: 'Riverside village'
    });
  });

  it('omits safe routes from SMS when the warning does not have them', async () => {
    const context = notificationContext();
    const warning = publishedWarning();
    delete (warning as { safeRoutes?: string }).safeRoutes;
    seedResident(context.recipients);

    await context.service.notifyPublishedWarning(warning);

    expect(context.sms.sent[0]?.message ?? '').not.toContain('Safe Routes');
  });

  it('never logs or stores Notify.lk credentials or resident contact values', async () => {
    const apiKey = 'test-api-key-not-a-real-secret';
    const userId = 'test-notify-lk-user-1234';
    const echoedKeyResponse = (async () => new Response(
      JSON.stringify({ status: 'error', code: '100', message: `Invalid API KEY ${apiKey}` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as unknown as typeof fetch;
    const provider = new NotifyLkSmsProvider({ userId, apiKey, senderId: 'NotifyDEMO' }, echoedKeyResponse);
    const { logger, logs } = recordingLogger();
    const context = notificationContext({ sms: { provider, sent: [] }, logger });
    const warning = publishedWarning();
    seedResident(context.recipients, { id: 'resident-a', phoneNumber: '0771234567' });

    await context.service.notifyPublishedWarning(warning);

    const smsDelivery = await context.deliveries.find(warning.id, 'resident-a', 'SMS');
    expect(smsDelivery).toMatchObject({ status: 'FAILED', errorCode: '100' });
    expect(smsDelivery?.errorMessage).toContain('[redacted]');
    expect(smsDelivery?.errorMessage).not.toContain(apiKey);

    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(apiKey);
    expect(serializedLogs).not.toContain(userId);
    expect(serializedLogs).not.toContain('0771234567');
    expect(serializedLogs).not.toContain('fcm-token-a');
  });
});
