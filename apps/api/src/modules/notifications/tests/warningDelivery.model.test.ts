import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { WarningDeliveryModel, toSafeWarningDelivery } from '../models/warningDelivery.model.js';

function document() {
  return new WarningDeliveryModel({
    warningId: new mongoose.Types.ObjectId(),
    recipientId: new mongoose.Types.ObjectId(),
    channel: 'SMS',
    status: 'SENT',
    provider: 'NOTIFY_LK',
    providerStatus: 'Sent',
    providerMessageId: 'notify-lk-1',
    sentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

describe('warning notification delivery persistence', () => {
  it('defines relationships, enums, timestamps, and serialization', async () => {
    const delivery = document();

    await expect(delivery.validate()).resolves.toBeUndefined();
    expect(WarningDeliveryModel.schema.path('warningId').options.ref).toBe('Warning');
    expect(WarningDeliveryModel.schema.path('recipientId').options.ref).toBe('User');
    expect(WarningDeliveryModel.schema.path('channel').options.enum).toEqual(['SMS', 'PUSH']);
    expect(WarningDeliveryModel.schema.path('status').options.enum).toEqual(['SENT', 'FAILED', 'SKIPPED']);
    expect(WarningDeliveryModel.schema.path('provider').options.enum).toEqual(['NOTIFY_LK', 'FCM', 'MOCK']);
    expect(WarningDeliveryModel.schema.path('skipReason').options.enum).toEqual([
      'INVALID_OR_MISSING_PHONE',
      'MISSING_PUSH_TOKEN',
      'PROVIDER_NOT_CONFIGURED'
    ]);

    expect(toSafeWarningDelivery(delivery)).toMatchObject({
      warningId: delivery.warningId.toString(),
      recipientId: delivery.recipientId.toString(),
      channel: 'SMS',
      status: 'SENT',
      provider: 'NOTIFY_LK',
      providerStatus: 'Sent',
      providerMessageId: 'notify-lk-1',
      sentAt: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(toSafeWarningDelivery(delivery)).not.toHaveProperty('_id');
  });

  it('enforces one delivery per warning, recipient and channel', () => {
    expect(WarningDeliveryModel.schema.indexes()).toContainEqual([
      { warningId: 1, recipientId: 1, channel: 1 },
      expect.objectContaining({ unique: true })
    ]);
  });

  it('serializes a skipped delivery without provider credentials', () => {
    const delivery = new WarningDeliveryModel({
      warningId: new mongoose.Types.ObjectId(),
      recipientId: new mongoose.Types.ObjectId(),
      channel: 'PUSH',
      status: 'SKIPPED',
      skipReason: 'MISSING_PUSH_TOKEN',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const safe = toSafeWarningDelivery(delivery);

    expect(safe).toMatchObject({ channel: 'PUSH', status: 'SKIPPED', skipReason: 'MISSING_PUSH_TOKEN' });
    expect(safe).not.toHaveProperty('provider');
    expect(safe).not.toHaveProperty('sentAt');
  });

  it.each([
    { channel: 'EMAIL' },
    { status: 'QUEUED' },
    { provider: 'TWILIO' },
    { skipReason: 'UNKNOWN' }
  ])('rejects invalid persisted data %j', async (invalid) => {
    const delivery = document();
    delivery.set(invalid);

    await expect(delivery.validate()).rejects.toThrow();
  });
});