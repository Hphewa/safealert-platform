import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { officerId, warningContext, warningInput, warningToken } from './warning.fixtures.js';

const path = '/api/v1/warnings';

// LDFEW-115: helper to create a published warning ready for lifecycle tests.
async function publishedWarningContext() {
  const context = await warningContext('HIGH');
  const create = await request(context.app).post(path).auth(warningToken(), { type: 'bearer' }).send(context.payload);
  expect(create.status).toBe(201);
  const warningId: string = create.body.warning.id;
  const publish = await request(context.app)
    .post(`${path}/${warningId}/publish`)
    .auth(warningToken(), { type: 'bearer' })
    .send({ notificationTarget: { scope: 'AFFECTED_AREA' } });
  expect(publish.status).toBe(200);
  return { ...context, warningId };
}

// LDFEW-115: helper to create a draft warning.
async function draftWarningContext() {
  const context = await warningContext('HIGH');
  const create = await request(context.app).post(path).auth(warningToken(), { type: 'bearer' }).send(context.payload);
  expect(create.status).toBe(201);
  const warningId: string = create.body.warning.id;
  return { ...context, warningId };
}

describe('LDFEW-115 update warning', () => {
  it('officer can update content fields of a draft warning', async () => {
    const { app, warningId } = await draftWarningContext();
    const response = await request(app)
      .patch(`${path}/${warningId}`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ requiredAction: 'Move to the community shelter immediately.' });
    expect(response.status).toBe(200);
    expect(response.body.warning.requiredAction).toBe('Move to the community shelter immediately.');
    expect(response.body.warning.status).toBe('DRAFT');
    expect(response.body.warning.id).toBe(warningId);
  });

  it('officer can update content fields of a published warning', async () => {
    const { app, warningId } = await publishedWarningContext();
    const response = await request(app)
      .patch(`${path}/${warningId}`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ message: 'Updated instructions for residents in flood zone.' });
    expect(response.status).toBe(200);
    expect(response.body.warning.message).toBe('Updated instructions for residents in flood zone.');
    expect(response.body.warning.status).toBe('PUBLISHED');
  });

  it('preserves assessmentId, hazardReportId, createdById, and riskLevel after update', async () => {
    const { app, warningId, warnings } = await draftWarningContext();
    const before = warnings.warnings.get(warningId)!;
    await request(app)
      .patch(`${path}/${warningId}`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ unsafeRoads: 'Bridge Road and Lower Road' });
    const after = warnings.warnings.get(warningId)!;
    expect(after.assessmentId).toBe(before.assessmentId);
    expect(after.hazardReportId).toBe(before.hazardReportId);
    expect(after.createdById).toBe(before.createdById);
    expect(after.riskLevel).toBe(before.riskLevel);
  });

  it('rejects forged status, riskLevel, and relationship fields in update body', async () => {
    const { app, warningId } = await draftWarningContext();
    for (const field of ['status', 'riskLevel', 'hazardReportId', 'createdById', 'publishedAt', 'publishedById', 'cancelledById', 'archivedById']) {
      const response = await request(app)
        .patch(`${path}/${warningId}`)
        .auth(warningToken(), { type: 'bearer' })
        .send({ [field]: 'CRITICAL', message: warningInput.message });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects blank required fields in update', async () => {
    const { app, warningId } = await draftWarningContext();
    const cases: Array<[string, string]> = [['requiredAction', ''], ['message', '   '], ['unsafeRoads', '']];
    for (const pair of cases) {
      const field = pair[0] as string;
      const value = pair[1] as string;
      const response = await request(app)
        .patch(`${path}/${warningId}`)
        .auth(warningToken(), { type: 'bearer' })
        .send({ [field]: value });
      expect(response.status).toBe(400);
    }
  });

  it('rejects unauthenticated update', async () => {
    const { app, warningId } = await draftWarningContext();
    const response = await request(app).patch(`${path}/${warningId}`).send({ message: warningInput.message });
    expect(response.status).toBe(401);
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)('rejects %s role update', async (role) => {
    const { app, warningId } = await draftWarningContext();
    expect((await request(app).patch(`${path}/${warningId}`).auth(warningToken(role), { type: 'bearer' }).send({ message: warningInput.message })).status).toBe(403);
  });

  it('rejects update of a cancelled warning', async () => {
    const { app, warningId } = await publishedWarningContext();
    await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app)
      .patch(`${path}/${warningId}`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ message: 'Should be rejected.' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_NOT_EDITABLE');
  });

  it('rejects update of an archived warning', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app)
      .patch(`${path}/${warningId}`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ message: 'Should be rejected.' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_NOT_EDITABLE');
  });
});

describe('LDFEW-115 cancel warning', () => {
  it('cancels a draft warning and sets status to CANCELLED', async () => {
    const { app, warningId, warnings } = await draftWarningContext();
    const response = await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('CANCELLED');
    expect(response.body.warning.cancelledById).toBe(officerId);
    expect(response.body.warning.cancelledAt).toBeDefined();
    expect(warnings.warnings.get(warningId)!.status).toBe('CANCELLED');
  });

  it('cancels a published warning and sets status to CANCELLED', async () => {
    const { app, warningId } = await publishedWarningContext();
    const response = await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('CANCELLED');
  });

  it('rejects cancelling an already-cancelled warning', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_ALREADY_CANCELLED');
  });

  it('rejects cancelling an archived warning', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_ALREADY_ARCHIVED');
  });

  it('rejects unauthenticated cancel', async () => {
    const { app, warningId } = await draftWarningContext();
    expect((await request(app).post(`${path}/${warningId}/cancel`)).status).toBe(401);
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)('rejects %s role cancel', async (role) => {
    const { app, warningId } = await draftWarningContext();
    expect((await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(role), { type: 'bearer' })).status).toBe(403);
  });

  it('rejects cancel with invalid warning ID', async () => {
    const { app } = await warningContext('HIGH');
    expect((await request(app).post(`${path}/invalid/cancel`).auth(warningToken(), { type: 'bearer' })).status).toBe(400);
    expect((await request(app).post(`${path}/507f1f77bcf86cd799439011/cancel`).auth(warningToken(), { type: 'bearer' })).status).toBe(404);
  });
});

describe('LDFEW-115 archive warning', () => {
  it('archives a draft warning and sets status to ARCHIVED', async () => {
    const { app, warningId, warnings } = await draftWarningContext();
    const response = await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('ARCHIVED');
    expect(response.body.warning.archivedById).toBe(officerId);
    expect(response.body.warning.archivedAt).toBeDefined();
    expect(warnings.warnings.get(warningId)!.status).toBe('ARCHIVED');
  });

  it('archives a published warning', async () => {
    const { app, warningId } = await publishedWarningContext();
    const response = await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('ARCHIVED');
  });

  it('archives a cancelled warning', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.warning.status).toBe('ARCHIVED');
  });

  it('rejects archiving an already-archived warning', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_ALREADY_ARCHIVED');
  });

  it('rejects unauthenticated archive', async () => {
    const { app, warningId } = await draftWarningContext();
    expect((await request(app).post(`${path}/${warningId}/archive`)).status).toBe(401);
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)('rejects %s role archive', async (role) => {
    const { app, warningId } = await draftWarningContext();
    expect((await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(role), { type: 'bearer' })).status).toBe(403);
  });

  it('rejects archive with invalid warning ID', async () => {
    const { app } = await warningContext('HIGH');
    expect((await request(app).post(`${path}/invalid/archive`).auth(warningToken(), { type: 'bearer' })).status).toBe(400);
    expect((await request(app).post(`${path}/507f1f77bcf86cd799439011/archive`).auth(warningToken(), { type: 'bearer' })).status).toBe(404);
  });
});

describe('LDFEW-115 lifecycle state guards', () => {
  it('CANCELLED warning cannot be republished', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/cancel`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app)
      .post(`${path}/${warningId}/publish`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } });
    expect(response.status).toBe(409);
  });

  it('ARCHIVED warning cannot be republished', async () => {
    const { app, warningId } = await draftWarningContext();
    await request(app).post(`${path}/${warningId}/archive`).auth(warningToken(), { type: 'bearer' });
    const response = await request(app)
      .post(`${path}/${warningId}/publish`)
      .auth(warningToken(), { type: 'bearer' })
      .send({ notificationTarget: { scope: 'AFFECTED_AREA' } });
    expect(response.status).toBe(409);
  });
});
