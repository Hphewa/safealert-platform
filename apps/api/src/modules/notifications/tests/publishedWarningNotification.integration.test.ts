import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { SafeWarningNotificationDelivery } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryWarningRepository } from '../../warnings/repositories/inMemoryWarning.repository.js';
import { InMemoryNotificationRecipientRepository } from '../repositories/inMemoryNotificationRecipient.repository.js';
import { InMemoryWarningDeliveryRepository } from '../repositories/inMemoryWarningDelivery.repository.js';
import { fakePushProvider, fakeSmsProvider, notificationToken } from './notification.fixtures.js';

type FakeSms = ReturnType<typeof fakeSmsProvider>;
type FakePush = ReturnType<typeof fakePushProvider>;
type SupertestApp = Parameters<typeof request>[0];

async function waitForDeliveries(
  deliveries: InMemoryWarningDeliveryRepository,
  warningId: string,
  expected: number
): Promise<SafeWarningNotificationDelivery[]> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const records = await deliveries.listByWarning(warningId);

    if (records.length >= expected) return records;

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  return deliveries.listByWarning(warningId);
}

type ContextOptions = {
  sms?: FakeSms;
  push?: FakePush;
  seedResident?: boolean;
};

async function context(options: ContextOptions = {}) {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const warnings = new InMemoryWarningRepository();
  const recipients = new InMemoryNotificationRecipientRepository();
  const deliveries = new InMemoryWarningDeliveryRepository();
  const sms = options.sms ?? fakeSmsProvider();
  const push = options.push ?? fakePushProvider();

  if (options.seedResident ?? true) {
    recipients.seedResident({
      id: '507f1f77bcf86cd799439201',
      area: 'Riverside Village',
      district: 'Colombo',
      country: 'Sri Lanka',
      phoneNumber: '0771234567',
      pushToken: 'fcm-token-a'
    });
  }

  const app = createApp({
    config: loadConfig(),
    warningRepository: warnings,
    warningDeliveryRepository: deliveries,
    notificationRecipientRepository: recipients,
    smsProvider: sms.provider,
    pushProvider: push.provider
  });

  const draft = await warnings.create({
    assessmentId: '507f1f77bcf86cd799439112',
    hazardReportId: '507f1f77bcf86cd799439113',
    createdById: '123456789012345678901235',
    affectedArea: 'Riverside Village',
    riskLevel: 'HIGH',
    requiredAction: 'Move to the community hall.',
    unsafeRoads: 'River Road bridge',
    safeRoutes: 'Hill Road',
    message: 'Flood water is rising near homes.',
    attachments: [],
    status: 'DRAFT'
  });

  return { app, warnings, recipients, deliveries, sms, push, draft };
}

function publish(app: SupertestApp, warningId: string, body: object = { notificationTarget: { scope: 'AFFECTED_AREA' } }) {
  return request(app).post(`/api/v1/warnings/${warningId}/publish`).auth(notificationToken(), { type: 'bearer' }).send(body);
}

describe('LDFEW-127 publication triggers targeted notifications', () => {
  it('sends SMS and PUSH only after the warning is persisted as PUBLISHED', async () => {
    const { app, warnings, deliveries, sms, push, draft } = await context();

    const response = await publish(app, draft.id);

    expect(response.status).toBe(200);
    expect(response.body.warning).toMatchObject({ status: 'PUBLISHED', notificationTarget: { scope: 'AFFECTED_AREA' } });
    expect(JSON.stringify(response.body)).not.toContain('api_key');
    expect(JSON.stringify(response.body)).not.toContain('private_key');

    const records = await waitForDeliveries(deliveries, draft.id, 2);
    expect(records).toHaveLength(2);
    expect(sms.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
    expect((await warnings.findById(draft.id))?.status).toBe('PUBLISHED');
  });

  it('does not notify when publication is rejected', async () => {
    const { app, deliveries, sms, push, draft } = await context();

    const response = await publish(app, draft.id, { notificationTarget: { scope: 'DISTRICT', district: 'Not a district' } });

    expect(response.status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sms.sent).toHaveLength(0);
    expect(push.sent).toHaveLength(0);
    expect(await deliveries.listByWarning(draft.id)).toHaveLength(0);
  });

  it('does not send a duplicate notification when publication is triggered again', async () => {
    const { app, deliveries, sms, push, draft } = await context();

    expect((await publish(app, draft.id)).status).toBe(200);
    await waitForDeliveries(deliveries, draft.id, 2);
    expect((await publish(app, draft.id)).status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sms.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
    expect(await deliveries.listByWarning(draft.id)).toHaveLength(2);
  });

  it('keeps the warning PUBLISHED when every provider fails', async () => {
    const sms = fakeSmsProvider({ throwError: new Error('Notify.lk is unreachable') });
    const push = fakePushProvider({
      result: { status: 'FAILED', provider: 'FCM', errorCode: 'UNREGISTERED', errorMessage: 'Token is unknown.' }
    });
    const { app, warnings, deliveries, draft } = await context({ sms, push });

    const response = await publish(app, draft.id);

    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('PUBLISHED');
    const records = await waitForDeliveries(deliveries, draft.id, 2);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'SMS', status: 'FAILED', errorCode: 'PROVIDER_REQUEST_FAILED' }),
      expect.objectContaining({ channel: 'PUSH', status: 'FAILED', errorCode: 'UNREGISTERED' })
    ]));
    expect((await warnings.findById(draft.id))?.status).toBe('PUBLISHED');
  });

  it('does not fail publication when no resident matches the target', async () => {
    const { app, warnings, deliveries, sms, draft } = await context({ seedResident: false });

    const response = await publish(app, draft.id);

    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('PUBLISHED');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sms.sent).toHaveLength(0);
    expect(await deliveries.listByWarning(draft.id)).toHaveLength(0);
    expect((await warnings.findById(draft.id))?.status).toBe('PUBLISHED');
  });
});