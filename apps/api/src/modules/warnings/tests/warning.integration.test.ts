import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { WARNING_FIELD_LIMITS } from '@safealert/contracts';
import { officerId, warningContext, warningToken } from './warning.fixtures.js';

const path = '/api/v1/warnings';
describe('LDFEW-112 create warning API', () => {
  it.each(['HIGH', 'CRITICAL'] as const)('creates a %s draft using saved assessment and authenticated officer', async (riskLevel) => {
    const { app, assessment, assessments, warnings, reportId, payload } = await warningContext(riskLevel);
    const response = await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send(payload);
    expect(response.status).toBe(201);
    expect(response.body.warning).toMatchObject({ ...payload, riskLevel, status: 'DRAFT',
      hazardReportId: reportId, createdById: officerId,
      id: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(warnings.warnings.get(response.body.warning.id)).toEqual(response.body.warning);
    expect(await assessments.findById(assessment.id)).toEqual(assessment);
  });
  it.each(['LOW', 'MODERATE'] as const)('rejects saved %s risk despite HIGH system suggestion', async (riskLevel) => {
    const { app, warnings, payload } = await warningContext(riskLevel);
    const response = await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WARNING_RISK_NOT_ELIGIBLE');
    expect(warnings.warnings.size).toBe(0);
  });
  it('requires authentication', async () => {
    const { app, payload, warnings } = await warningContext();
    expect((await request(app).post(path).send(payload)).status).toBe(401);
    expect(warnings.warnings.size).toBe(0);
  });
  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)('rejects %s users', async (role) => {
    const { app, payload, warnings } = await warningContext();
    expect((await request(app).post(path).auth(warningToken(role), { type: 'bearer' }).send(payload)).status).toBe(403);
    expect(warnings.warnings.size).toBe(0);
  });
  it.each([['invalid', 400], ['123456789012345678901299', 404]] as const)('rejects assessment ID %s', async (assessmentId, status) => {
    const { app, payload, warnings } = await warningContext();
    expect((await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send({ ...payload, assessmentId })).status).toBe(status);
    expect(warnings.warnings.size).toBe(0);
  });
  it.each(['riskLevel', 'finalRiskLevel', 'officerId', 'createdById', 'hazardReportId', 'status', 'createdAt', 'updatedAt'])('rejects forged %s', async (field) => {
    const { app, payload, warnings } = await warningContext();
    const response = await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send({ ...payload, [field]: 'CRITICAL' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(warnings.warnings.size).toBe(0);
  });
  it.each(['affectedArea', 'requiredAction', 'unsafeRoads', 'message'] as const)('validates required %s', async (field) => {
    const { app, payload, warnings } = await warningContext();
    for (const value of [undefined, '', '   ', 42, 'x'.repeat(WARNING_FIELD_LIMITS[field] + 1)]) {
      expect((await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send({ ...payload, [field]: value })).status).toBe(400);
    }
    expect(warnings.warnings.size).toBe(0);
  });
  it.each([
    { safeRoutes: 'x'.repeat(2001) }, { attachments: ['file:///private/photo.jpg'] },
    { attachments: ['javascript:alert(1)'] }, { attachments: ['not a URL'] },
    { attachments: Array(6).fill('https://example.com/photo.jpg') }
  ])('rejects invalid optional fields %j', async (invalid) => {
    const { app, payload } = await warningContext();
    expect((await request(app).post(path).auth(warningToken(), { type: 'bearer' }).send({ ...payload, ...invalid })).status).toBe(400);
  });
  it('trims text and permits omitted optional fields', async () => {
    const { app, payload } = await warningContext();
    const response = await request(app).post(path).auth(warningToken(), { type: 'bearer' })
      .send({ ...payload, affectedArea: '  Riverside village  ', attachments: undefined, safeRoutes: undefined });
    expect(response.status).toBe(201);
    expect(response.body.warning.affectedArea).toBe('Riverside village');
    expect(response.body.warning.attachments).toEqual([]);
    expect(response.body.warning).not.toHaveProperty('safeRoutes');
  });
});
