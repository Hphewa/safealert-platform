import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';

const incidentsPath = '/api/v1/incidents';
const officerId = 'abcdef123456789012345604';
const residentId = 'abcdef123456789012345605';
const reportId = 'abcdef123456789012345601';
const memberReportId = 'abcdef123456789012345602';
const secondReportId = 'abcdef123456789012345603';

function token(role: UserRole = 'DISASTER_OFFICER') {
  return jwt.sign({ role }, 'test-access-secret', { subject: officerId, expiresIn: '15m' });
}

function report(overrides: Partial<SafeReport> = {}): SafeReport {
  return {
    id: reportId,
    residentId,
    hazardType: 'FLOOD',
    description: 'Flooding reported near the road.',
    severity: 'HIGH',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    status: 'VERIFIED',
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:05:00.000Z',
    verifiedById: officerId,
    verifiedAt: '2026-09-25T10:05:00.000Z',
    ...overrides
  };
}

function context() {
  const reports = new InMemoryReportRepository();
  const incidents = new InMemoryIncidentRepository();
  reports.seedReport(report());
  const app = createApp({ config: loadConfig(), reportRepository: reports, incidentRepository: incidents });
  const auth = (role: UserRole = 'DISASTER_OFFICER') => ({ bearer: token(role) });
  return { app, reports, incidents, auth };
}

async function seedIncident(
  incidents: InMemoryIncidentRepository,
  reportIds: string[],
  overrides: Partial<Parameters<InMemoryIncidentRepository['create']>[0]> = {}
) {
  return incidents.create({
    hazardType: 'FLOOD',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds,
    status: 'ACTIVE',
    createdById: officerId,
    ...overrides
  });
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('incident grouping actions', () => {
  it('creates a new incident from a verified report through the officer API', async () => {
    const { app } = context();

    const response = await request(app)
      .post(incidentsPath)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportIds: [reportId] });

    expect(response.status).toBe(201);
    expect(response.body.incident).toMatchObject({ reportIds: [reportId], status: 'ACTIVE', createdById: officerId });
  });

  it('attaches a verified report selected by the officer even when it is outside candidate heuristics', async () => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({
      id: memberReportId,
      createdAt: '2026-09-25T10:00:00.000Z'
    }));
    reports.seedReport(report({
      id: secondReportId,
      location: { type: 'Point', coordinates: [79.95, 6.95] },
      createdAt: '2026-09-25T18:00:00.000Z'
    }));
    const incident = await seedIncident(incidents, [memberReportId]);

    const response = await request(app)
      .post(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: secondReportId });

    expect(response.status).toBe(200);
    expect(response.body.incident.reportIds).toEqual([memberReportId, secondReportId]);
    expect((await incidents.findById(incident.id))?.reportIds).toEqual([memberReportId, secondReportId]);
  });

  it.each(['PENDING', 'REJECTED'] as const)('cannot attach a %s report', async (status) => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({ id: secondReportId, status }));
    const incident = await seedIncident(incidents, [reportId]);

    const response = await request(app)
      .post(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: secondReportId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_REPORT_STATE');
    expect((await incidents.findById(incident.id))?.reportIds).toEqual([reportId]);
  });

  it('rejects a missing report, missing incident, and inactive incident', async () => {
    const { app, incidents } = context();
    const resolved = await seedIncident(incidents, [reportId], { status: 'RESOLVED' });

    const missingReport = await request(app)
      .post(`${incidentsPath}/${resolved.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: secondReportId });
    const missingIncident = await request(app)
      .post(`${incidentsPath}/abcdef123456789012345699/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId });
    const inactiveIncident = await request(app)
      .post(`${incidentsPath}/${resolved.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId });

    expect(missingReport.status).toBe(404);
    expect(missingReport.body.error.code).toBe('REPORT_NOT_FOUND');
    expect(missingIncident.status).toBe(404);
    expect(missingIncident.body.error.code).toBe('INCIDENT_NOT_FOUND');
    expect(inactiveIncident.status).toBe(409);
    expect(inactiveIncident.body.error.code).toBe('INCIDENT_NOT_ACTIVE');
  });

  it('rejects incompatible hazards and duplicate membership', async () => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({ id: secondReportId, hazardType: 'LANDSLIDE' }));
    const incident = await seedIncident(incidents, [reportId]);

    const mismatch = await request(app)
      .post(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: secondReportId });
    const duplicate = await request(app)
      .post(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId });

    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('INCIDENT_HAZARD_MISMATCH');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('REPORT_ALREADY_IN_INCIDENT');
  });

  it('rejects a report already assigned to another active incident', async () => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({ id: memberReportId }));
    reports.seedReport(report({ id: secondReportId }));
    const owner = await seedIncident(incidents, [memberReportId]);
    const target = await seedIncident(incidents, [secondReportId]);

    const response = await request(app)
      .post(`${incidentsPath}/${target.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: memberReportId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACTIVE_INCIDENT_EXISTS');
    expect((await incidents.findById(owner.id))?.reportIds).toEqual([memberReportId]);
    expect((await incidents.findById(target.id))?.reportIds).toEqual([secondReportId]);
  });

  it('returns incident details with related reports in incident order', async () => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({ id: memberReportId, description: 'First evidence' }));
    reports.seedReport(report({ id: secondReportId, description: 'Second evidence' }));
    const incident = await seedIncident(incidents, [secondReportId, memberReportId]);

    const response = await request(app)
      .get(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.incident).toEqual(incident);
    expect(response.body.reports.map((item: SafeReport) => item.id)).toEqual([secondReportId, memberReportId]);
    expect(response.body.reports[0].description).toBe('Second evidence');
  });

  it('lists active incidents with their related reports for assessment selection', async () => {
    const { app, reports, incidents } = context();
    reports.seedReport(report({ id: memberReportId, description: 'Grouped evidence' }));
    reports.seedReport(report({ id: secondReportId, createdAt: '2026-09-25T11:00:00.000Z' }));
    const active = await seedIncident(incidents, [memberReportId, secondReportId]);
    await seedIncident(incidents, [reportId], { status: 'RESOLVED' });

    const response = await request(app)
      .get(`${incidentsPath}/active`)
      .set('Authorization', `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.incidents).toHaveLength(1);
    expect(response.body.incidents[0]).toMatchObject({
      incident: active,
      reports: [expect.objectContaining({ id: memberReportId }), expect.objectContaining({ id: secondReportId })]
    });
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'EMERGENCY_RESPONDER'] as const)(
    'denies %s grouping actions', async (role) => {
      const { app, incidents } = context();
      const incident = await seedIncident(incidents, [reportId]);
      const attach = await request(app)
        .post(`${incidentsPath}/${incident.id}/reports`)
        .set('Authorization', `Bearer ${token(role)}`)
        .send({ reportId: secondReportId });
      const read = await request(app)
        .get(`${incidentsPath}/${incident.id}/reports`)
        .set('Authorization', `Bearer ${token(role)}`);

      expect(attach.status).toBe(403);
      expect(read.status).toBe(403);
    }
  );

  it('rejects forged fields in the attach request', async () => {
    const { app, incidents } = context();
    const incident = await seedIncident(incidents, [reportId]);
    const response = await request(app)
      .post(`${incidentsPath}/${incident.id}/reports`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ reportId: secondReportId, createdById: 'forged', status: 'CLOSED' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect((await incidents.findById(incident.id))?.reportIds).toEqual([reportId]);
  });
});
