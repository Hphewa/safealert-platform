import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../../config/env.js';
import { errorHandler } from '../../../shared/errorMiddleware.js';
import { UserModel } from '../../users/models/user.model.js';
import { InMemoryWarningDeliveryRepository } from '../../notifications/repositories/inMemoryWarningDelivery.repository.js';
import { publishedWarning } from '../../notifications/tests/notification.fixtures.js';
import { createWarningRouter } from '../routes/warning.routes.js';
import type { WarningService } from '../services/warning.service.js';
import { warningToken } from './warning.fixtures.js';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const warning = publishedWarning();
  const get = vi.fn(async (id: string) => id === warning.id ? warning : null);
  const deliveries = new InMemoryWarningDeliveryRepository();
  const list = vi.spyOn(deliveries, 'listByWarning');
  // No resident personal information is necessary for summary counts.
  vi.spyOn(UserModel, 'find').mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => [] }) }) } as never);
  const app = express();
  const config = { ...loadConfig(), jwtAccessSecret: 'test-access-secret' };
  app.use('/api/v1/warnings', createWarningRouter({ get } as unknown as WarningService, config, deliveries));
  app.use(errorHandler);
  const path = `/api/v1/warnings/${warning.id}/delivery`;
  return { app, path, warning, deliveries, list };
}

describe('Officer warning delivery summary endpoint', () => {
  it('aggregates persisted SMS SKIPPED and PUSH SENT records for the requested warning', async () => {
    const { app, path, warning, deliveries, list } = setup();
    const recipientId = '507f1f77bcf86cd799439201';
    deliveries.seedDelivery({ warningId: warning.id, recipientId, channel: 'SMS', status: 'SKIPPED' });
    deliveries.seedDelivery({ warningId: warning.id, recipientId, channel: 'PUSH', status: 'SENT' });
    deliveries.seedDelivery({ warningId: '507f1f77bcf86cd799439999', recipientId, channel: 'PUSH', status: 'FAILED' });
    const response = await request(app).get(path).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      summary: { recipientCount: 1, sms: { sent: 0, failed: 0, skipped: 1 }, push: { sent: 1, failed: 0, skipped: 0 } },
      failedDeliveries: []
    });
    expect(list).toHaveBeenCalledWith(warning.id);
  });

  it('returns a fresh summary when records arrive after the first request', async () => {
    const { app, path, warning, deliveries } = setup();
    const first = await request(app).get(path).auth(warningToken(), { type: 'bearer' });
    expect(first.body.summary.recipientCount).toBe(0);
    deliveries.seedDelivery({ warningId: warning.id, recipientId: '507f1f77bcf86cd799439201', channel: 'PUSH', status: 'SENT' });
    const second = await request(app).get(path).auth(warningToken(), { type: 'bearer' });
    expect(second.body.summary.push.sent).toBe(1);
  });

  it.each([['invalid', 400], ['6abcaaf9e79cadd4cf17d8c9', 404]])('rejects missing/invalid warning %s instead of returning zeros', async (id, status) => {
    const { app, list } = setup();
    const response = await request(app).get(`/api/v1/warnings/${id}/delivery`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(status);
    expect(response.body).not.toHaveProperty('summary');
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and resident requests', async () => {
    const { app, path, list } = setup();
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).auth(warningToken('RESIDENT'), { type: 'bearer' })).status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });
});
