import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryNotificationProfileRepository } from '../repositories/inMemoryNotificationProfile.repository.js';
import { InMemoryNotificationRecipientRepository } from '../repositories/inMemoryNotificationRecipient.repository.js';
import { InMemoryWarningDeliveryRepository } from '../repositories/inMemoryWarningDelivery.repository.js';

const base = '/api/v1/notifications/profile';
const residentId = '507f1f77bcf86cd799439301';

function context(seedProfile = true) {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const profiles = new InMemoryNotificationProfileRepository();

  if (seedProfile) profiles.seedProfile(residentId, {});

  const app = createApp({
    config: loadConfig(),
    notificationProfileRepository: profiles,
    notificationRecipientRepository: new InMemoryNotificationRecipientRepository(),
    warningDeliveryRepository: new InMemoryWarningDeliveryRepository()
  });

  return {
    app,
    profiles,
    token: jwt.sign({ role: 'RESIDENT' }, 'test-access-secret', { subject: residentId, expiresIn: '15m' })
  };
}

describe('LDFEW-127 notification profile API', () => {
  it('rejects officer access to resident profiles', async () => {
    const { app } = context();
    const token = jwt.sign({ role: 'DISASTER_OFFICER' }, 'test-access-secret', { subject: residentId });
    expect((await request(app).get(base).auth(token, { type: 'bearer' })).status).toBe(403);
  });

  it('rejects arbitrary districts, countries, and Expo push-service tokens', async () => {
    const { app, token } = context();
    for (const input of [{ district: 'Unknown' }, { country: 'India' }, { pushToken: 'ExpoPushToken[test]' }]) {
      expect((await request(app).put(base).auth(token, { type: 'bearer' }).send(input)).status).toBe(400);
    }
  });
  it('requires authentication', async () => {
    const { app } = context();

    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).put(base).send({ pushToken: 'fcm-token-a' })).status).toBe(401);
  });

  it('stores the device push token and contact details for the authenticated user', async () => {
    const { app, profiles, token } = context();

    const response = await request(app).put(base).auth(token, { type: 'bearer' }).send({
      area: '  Riverside Village ',
      district: 'Colombo',
      country: 'Sri Lanka',
      phoneNumber: '0771234567',
      pushToken: 'fcm-token-from-device'
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      profile: {
        area: 'riversidevillage',
        district: 'colombo',
        country: 'srilanka',
        phoneNumber: '94771234567',
        pushToken: 'fcm-token-from-device'
      }
    });
    expect(await profiles.findProfile(residentId)).toMatchObject({ pushToken: 'fcm-token-from-device' });
    expect((await request(app).get(base).auth(token, { type: 'bearer' })).body).toEqual(response.body);
  });

  it('rejects forged identity and targeting fields', async () => {
    const { app, token } = context();

    for (const field of ['userId', 'id', 'recipientId', 'role', 'isActive', 'notificationScope', 'district*']) {
      const response = await request(app).put(base).auth(token, { type: 'bearer' })
        .send({ pushToken: 'fcm-token-a', [field]: 'someone-else' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('validates the phone number and field lengths', async () => {
    const { app, token } = context();

    for (const phoneNumber of ['not-a-number', '0112345678', 'x'.repeat(25)]) {
      const response = await request(app).put(base).auth(token, { type: 'bearer' }).send({ phoneNumber });
      expect(response.status).toBe(400);
    }

    for (const invalid of [{ area: 'x'.repeat(301) }, { pushToken: 'x'.repeat(4097) }, { district: 42 }]) {
      expect((await request(app).put(base).auth(token, { type: 'bearer' }).send(invalid)).status).toBe(400);
    }
  });

  it('clears a stale push token and phone number when an empty value is sent', async () => {
    const { app, profiles, token } = context();
    await request(app).put(base).auth(token, { type: 'bearer' })
      .send({ area: 'Riverside Village', phoneNumber: '0771234567', pushToken: 'fcm-token-old' });

    const response = await request(app).put(base).auth(token, { type: 'bearer' })
      .send({ pushToken: '', phoneNumber: null });

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual({ area: 'riversidevillage' });
    expect(await profiles.findProfile(residentId)).toEqual({ area: 'riversidevillage' });
  });

  it('never returns provider credentials or notification provider settings', async () => {
    const { app, token } = context();
    const response = await request(app).put(base).auth(token, { type: 'bearer' })
      .send({ pushToken: 'fcm-token-a', phoneNumber: '0771234567' });

    expect([...Object.keys(response.body.profile)].sort()).toEqual(['phoneNumber', 'pushToken']);
    expect(JSON.stringify(response.body)).not.toContain('api_key');
    expect(JSON.stringify(response.body)).not.toContain('NOTIFY_LK');
    expect(JSON.stringify(response.body)).not.toContain('private_key');
  });

  it('reports a missing user profile', async () => {
    const { app, token } = context(false);

    const response = await request(app).get(base).auth(token, { type: 'bearer' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });
});
