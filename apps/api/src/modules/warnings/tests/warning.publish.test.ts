import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { warningContext, warningToken } from './warning.fixtures.js';

describe('LDFEW-113 publish warning', () => {
  it('publishes a draft and retains its target', async () => {
    const { app, payload } = await warningContext('HIGH');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    const response = await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning).toMatchObject({ status: 'PUBLISHED', affectedArea: 'Riverside village', publishedById: expect.any(String), publishedAt: expect.any(String) });
    expect((await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken(), { type: 'bearer' })).status).toBe(409);
  });
  it('rejects non-officers, invalid IDs, and missing warnings', async () => {
    const { app, payload } = await warningContext('HIGH');
    const created = await request(app).post('/api/v1/warnings').auth(warningToken(), { type: 'bearer' }).send(payload);
    expect((await request(app).post(`/api/v1/warnings/${created.body.warning.id}/publish`).auth(warningToken('RESIDENT'), { type: 'bearer' })).status).toBe(403);
    expect((await request(app).post('/api/v1/warnings/invalid/publish').auth(warningToken(), { type: 'bearer' })).status).toBe(400);
    expect((await request(app).post('/api/v1/warnings/507f1f77bcf86cd799439011/publish').auth(warningToken(), { type: 'bearer' })).status).toBe(404);
  });
});
