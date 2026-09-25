import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { USER_ROLES, type ReportStatus, type UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryFieldConfirmationRepository } from '../repositories/inMemoryFieldConfirmation.repository.js';
import { FieldConfirmationModel } from '../models/fieldConfirmation.model.js';

const reportId = '507f1f77bcf86cd799439011';
const volunteerId = '507f1f77bcf86cd799439012';
const token = (role: UserRole, id = volunteerId) => jwt.sign({ role }, 'test-access-secret', { subject: id, expiresIn: '15m' });
function context(status: ReportStatus = 'PENDING') {
  const reports = new InMemoryReportRepository();
  reports.seedReport({ id: reportId, residentId: 'resident', hazardType: 'FLOOD', description: 'Rising water', severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.86, 6.92] }, status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const confirmations = new InMemoryFieldConfirmationRepository();
  return { reports, confirmations, app: createApp({ config: loadConfig(), authRepository: new InMemoryAuthRepository(), reportRepository: reports, fieldConfirmationRepository: confirmations }) };
}
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});
const paths = [
  { action: 'confirm', body: {}, outcome: 'CONFIRMED' },
  { action: 'unable-to-confirm', body: { reason: 'Location does not match' }, outcome: 'UNABLE_TO_CONFIRM' }
];
describe('LDFEW-125 field confirmations', () => {
  it.each(paths)('$action excludes only the submitting volunteer from both actionable lists and preserves history', async ({ action, body }) => {
    const { app, reports, confirmations } = context();
    const original = { ...(await reports.findReportById(reportId))! };
    const untouchedId = '507f1f77bcf86cd799439014';
    const distantId = '507f1f77bcf86cd799439015';
    reports.seedReport({ ...original, id: untouchedId });
    reports.seedReport({ ...original, id: distantId, location: { type: 'Point', coordinates: [80.86, 6.92] } });
    const otherId = '507f1f77bcf86cd799439013';
    const queries = [
      { mode: 'incoming' },
      { mode: 'nearby', latitude: 6.92, longitude: 79.86, radiusKm: 10 }
    ];
    for (const query of queries) {
      const response = await request(app).get('/api/v1/reports/community').query(query).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' });
      expect(response.status).toBe(200);
      expect(response.body.reports.map((item: { id: string }) => item.id)).toContain(reportId);
    }
    const submitted = await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send(body);
    expect(submitted.status).toBe(201);
    // A fresh app using persisted repositories models a reload without client state.
    const refreshedApp = createApp({ config: loadConfig(), reportRepository: reports, fieldConfirmationRepository: confirmations });
    for (const server of [app, refreshedApp]) {
      for (const query of queries) {
        const response = await request(server).get('/api/v1/reports/community').query({ ...query, volunteerId: otherId }).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' });
        expect(response.status).toBe(200);
        const ids = response.body.reports.map((item: { id: string }) => item.id);
        expect(ids).not.toContain(reportId);
        expect(ids).toContain(untouchedId);
        expect(ids.includes(distantId)).toBe(query.mode === 'incoming');
        const other = await request(server).get('/api/v1/reports/community').query({ ...query, volunteerId }).auth(token('COMMUNITY_VOLUNTEER', otherId), { type: 'bearer' });
        expect(other.status).toBe(200);
        expect(other.body.reports.map((item: { id: string }) => item.id)).toContain(reportId);
      }
    }
    const history = await request(refreshedApp).get('/api/v1/field-confirmations/mine').query({ volunteerId: otherId }).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' });
    expect(history.status).toBe(200);
    expect(history.body.confirmations).toEqual([submitted.body.confirmation]);
    expect(history.body.confirmations[0].status).toBe('PENDING');
    const otherHistory = await request(app).get('/api/v1/field-confirmations/mine').query({ volunteerId }).auth(token('COMMUNITY_VOLUNTEER', otherId), { type: 'bearer' });
    expect(otherHistory.status).toBe(200);
    expect(otherHistory.body.confirmations).toEqual([]);
    const officer = await request(app).get(`/api/v1/field-confirmations/${reportId}`).auth(token('DISASTER_OFFICER'), { type: 'bearer' });
    expect(officer.status).toBe(200);
    expect(officer.body.confirmations).toEqual([submitted.body.confirmation]);
    const pending = await request(app).get('/api/v1/reports/officer/pending').auth(token('DISASTER_OFFICER'), { type: 'bearer' });
    expect(pending.status).toBe(200);
    expect(pending.body.reports.map((item: { id: string }) => item.id)).toContain(reportId);
    expect(await reports.findReportById(reportId)).toEqual(original);
  });
  it('requires volunteer authentication for personal history', async () => {
    const { app } = context();
    expect((await request(app).get('/api/v1/field-confirmations/mine')).status).toBe(401);
    for (const role of USER_ROLES.filter((value) => value !== 'COMMUNITY_VOLUNTEER')) {
      expect((await request(app).get('/api/v1/field-confirmations/mine').auth(token(role), { type: 'bearer' })).status).toBe(403);
    }
  });
  it.each(paths)('$action creates pending submission visible to officers without changing original report', async ({ action, body, outcome }) => {
    const { app, reports } = context();
    const before = await reports.findReportById(reportId);
    const detail = await request(app).get(`/api/v1/reports/community/${reportId}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' });
    expect(detail.status).toBe(200);
    const result = await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send(body);
    expect(result.status).toBe(201);
    expect(result.body.confirmation).toMatchObject({ reportId, volunteerId, outcome, status: 'PENDING', ...body });
    expect(Number.isNaN(Date.parse(result.body.confirmation.createdAt))).toBe(false);
    const review = await request(app).get(`/api/v1/field-confirmations/${reportId}`).auth(token('DISASTER_OFFICER'), { type: 'bearer' });
    expect(review.status).toBe(200);
    expect(review.body.confirmations).toEqual([result.body.confirmation]);
    expect(await reports.findReportById(reportId)).toEqual(before);
  });
  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'invalid' }, { reason: 'Other' }, { reason: 'Other', reasonDetails: '  ' }, { reason: 'Other', reasonDetails: 'x'.repeat(501) }])('rejects missing or invalid reason %j', async (body) => {
    const { app, confirmations } = context();
    const response = await request(app).post(`/api/v1/field-confirmations/${reportId}/unable-to-confirm`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send(body);
    expect(response.status).toBe(400);
    expect(await confirmations.findByReportId(reportId)).toEqual([]);
  });
  it('accepts Other with trimmed explanation', async () => {
    const { app } = context();
    const response = await request(app).post(`/api/v1/field-confirmations/${reportId}/unable-to-confirm`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send({ reason: 'Other', reasonDetails: '  Visibility too low  ' });
    expect(response.status).toBe(201);
    expect(response.body.confirmation.reasonDetails).toBe('Visibility too low');
  });
  for (const { action, body } of paths) {
    it.each(USER_ROLES.filter((role) => role !== 'COMMUNITY_VOLUNTEER'))(`${action} forbids %s`, async (role) => {
      const { app } = context();
      expect((await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).auth(token(role), { type: 'bearer' }).send(body)).status).toBe(403);
    });
    it(`${action} requires authentication and rejects forged identity/status`, async () => {
      const { app } = context();
      expect((await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).send(body)).status).toBe(401);
      for (const injected of [{ volunteerId: 'someone-else' }, { status: 'VERIFIED' }, { reportId: 'another-report' }]) {
        expect((await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send({ ...body, ...injected })).status).toBe(400);
      }
    });
    it.each([['invalid', 400], ['507f1f77bcf86cd799439099', 404]])(`${action} rejects report %s`, async (id, status) => {
      const { app } = context();
      expect((await request(app).post(`/api/v1/field-confirmations/${id}/${action}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send(body)).status).toBe(status);
    });
    it.each(['VERIFIED', 'REJECTED', 'CANCELLED', 'RESOLVED'] as const)(`${action} rejects ineligible %s report`, async (status) => {
      const { app, confirmations } = context(status);
      expect((await request(app).post(`/api/v1/field-confirmations/${reportId}/${action}`).auth(token('COMMUNITY_VOLUNTEER'), { type: 'bearer' }).send(body)).status).toBe(404);
      expect(await confirmations.findByReportId(reportId)).toEqual([]);
    });
  }
  it.each(USER_ROLES.filter((role) => role !== 'DISASTER_OFFICER'))('officer retrieval forbids %s', async (role) => {
    const { app } = context();
    expect((await request(app).get(`/api/v1/field-confirmations/${reportId}`).auth(token(role), { type: 'bearer' })).status).toBe(403);
  });
  it('model enforces flag reasons and pending status', async () => {
    await expect(new FieldConfirmationModel({ reportId, volunteerId, outcome: 'UNABLE_TO_CONFIRM' }).validate()).rejects.toThrow();
    await expect(new FieldConfirmationModel({ reportId, volunteerId, outcome: 'UNABLE_TO_CONFIRM', reason: 'Other' }).validate()).rejects.toThrow();
    const confirmation = new FieldConfirmationModel({ reportId, volunteerId, outcome: 'CONFIRMED' });
    await expect(confirmation.validate()).resolves.toBeUndefined();
    expect(confirmation.status).toBe('PENDING');
  });
});


