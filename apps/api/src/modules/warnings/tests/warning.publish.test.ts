import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { warningContext, warningToken } from './warning.fixtures.js';

describe('LDFEW-113 publish warning', () => {
  it('publishes a draft and retains its target', async () => {
    const { app, payload } = await warningContext('HIGH');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    const response = await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } });
    expect(response.status).toBe(200);
    expect(response.body.warning).toMatchObject({ status: 'PUBLISHED', affectedArea: 'Riverside village',
      notificationTarget: { scope: 'AFFECTED_AREA' }, publishedById: expect.any(String), publishedAt: expect.any(String) });
    expect((await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } })).status).toBe(409);
  });
  it('stores a separately selected district without changing the saved affected area', async () => {
    const { app, payload } = await warningContext('CRITICAL');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    const response = await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'DISTRICT', district: 'Colombo' } });
    expect(response.status).toBe(200);
    expect(response.body.warning).toMatchObject({ affectedArea: 'Riverside village', notificationTarget: { scope: 'DISTRICT', district: 'Colombo' } });
  });
  it('rejects an invalid or missing notification target while retaining the draft', async () => {
    const { app, payload, warnings } = await warningContext('HIGH');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    const invalid = await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'DISTRICT', district: 'Not a district' } });
    expect(invalid.status).toBe(400);
    expect((await warnings.findById(created.body.warning.id))?.status).toBe('DRAFT');
  });
  it('starts the post-publication handler only after the warning is persisted as published', async () => {
    const events: string[] = [];
    const { app, payload } = await warningContext('HIGH', async (warning) => {
      events.push(`${warning.status}:${warning.notificationTarget?.scope}`);
    });
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    const response = await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'WHOLE_COUNTRY' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(response.status).toBe(200);
    expect(events).toEqual(['PUBLISHED:WHOLE_COUNTRY']);
  });
  it('rejects non-officers, invalid IDs, and missing warnings', async () => {
    const { app, payload } = await warningContext('HIGH');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    expect((await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken('RESIDENT'), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } })).status).toBe(403);
    expect((await request(app).post('/api/v1/warnings/invalid/publish').auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } })).status).toBe(400);
    expect((await request(app).post('/api/v1/warnings/507f1f77bcf86cd799439011/publish').auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } })).status).toBe(404);
  });
});
