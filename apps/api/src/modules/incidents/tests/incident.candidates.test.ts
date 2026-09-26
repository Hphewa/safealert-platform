import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport, UserRole } from '@safealert/contracts';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';

const base = '/api/v1/incidents/candidates';
const officerId = 'abcdef123456789012345604';
const residentId = 'abcdef123456789012345605';
const reportId = 'abcdef123456789012345601';
const memberReportId = 'abcdef123456789012345602';
const secondMemberReportId = 'abcdef123456789012345603';
const farMemberReportId = 'abcdef123456789012345607';
const differentHazardReportId = 'abcdef123456789012345608';
const pendingReportId = 'abcdef123456789012345609';
const rejectedReportId = 'abcdef123456789012345610';

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
  const search = (id = reportId, role: UserRole = 'DISASTER_OFFICER') =>
    request(app).get(`${base}?reportId=${id}`).auth(token(role), { type: 'bearer' });
  return { reports, incidents, search };
}

async function addIncident(
  incidents: InMemoryIncidentRepository,
  reportIds: string[],
  location: [number, number] = [79.8615, 6.9272]
) {
  return incidents.create({
    hazardType: 'FLOOD',
    location: { type: 'Point', coordinates: location },
    reportIds,
    status: 'ACTIVE',
    createdById: officerId
  });
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('incident candidate API', () => {
  it('returns a same-hazard incident with close location and reporting time', async () => {
    const { reports, incidents, search } = context();
    reports.seedReport(report({ id: memberReportId, createdAt: '2026-09-25T09:30:00.000Z' }));
    const incident = await addIncident(incidents, [memberReportId]);

    const response = await search();

    expect(response.status).toBe(200);
    expect(response.body.candidates).toEqual([
      expect.objectContaining({
        incidentId: incident.id,
        hazardType: 'FLOOD',
        reportCount: 1,
        earliestReportAt: '2026-09-25T09:30:00.000Z',
        latestReportAt: '2026-09-25T09:30:00.000Z',
        distanceMeters: expect.any(Number)
      })
    ]);
  });

  it('excludes far, different-hazard, and outside-time incidents', async () => {
    const { reports, incidents, search } = context();
    reports.seedReport(report({ id: memberReportId, createdAt: '2026-09-25T09:30:00.000Z' }));
    reports.seedReport(report({
      id: farMemberReportId,
      location: { type: 'Point', coordinates: [79.95, 6.9271] },
      createdAt: '2026-09-25T10:10:00.000Z'
    }));
    reports.seedReport(report({
      id: differentHazardReportId,
      hazardType: 'LANDSLIDE',
      createdAt: '2026-09-25T10:10:00.000Z'
    }));
    const close = await addIncident(incidents, [memberReportId]);
    await addIncident(incidents, [farMemberReportId], [79.95, 6.9271]);
    await incidents.create({
      hazardType: 'LANDSLIDE', location: report().location, reportIds: [differentHazardReportId],
      status: 'ACTIVE', createdById: officerId
    });
    reports.seedReport(report({ id: secondMemberReportId, createdAt: '2026-09-25T13:01:00.000Z' }));
    const outsideTime = await addIncident(incidents, [secondMemberReportId]);

    const response = await search();
    const ids = response.body.candidates.map((candidate: { incidentId: string }) => candidate.incidentId);
    expect(response.status).toBe(200);
    expect(ids).toEqual([close.id]);
    expect(ids).not.toContain(outsideTime.id);
  });

  it('returns multiple matching incidents ordered by distance', async () => {
    const { reports, incidents, search } = context();
    reports.seedReport(report({ id: memberReportId, createdAt: '2026-09-25T09:45:00.000Z' }));
    reports.seedReport(report({ id: secondMemberReportId, createdAt: '2026-09-25T10:15:00.000Z' }));
    const farther = await addIncident(incidents, [memberReportId], [79.864, 6.929]);
    const closer = await addIncident(incidents, [secondMemberReportId], [79.8613, 6.9271]);

    const response = await search();
    expect(response.status).toBe(200);
    expect(response.body.candidates.map((candidate: { incidentId: string }) => candidate.incidentId))
      .toEqual([closer.id, farther.id]);
  });

  it('does not return the active incident that already contains the selected report', async () => {
    const { incidents, search } = context();
    const ownIncident = await addIncident(incidents, [reportId]);

    const response = await search();

    expect(response.status).toBe(200);
    expect(response.body.candidates).toEqual([]);
    expect(ownIncident.reportIds).toEqual([reportId]);
  });

  it.each(['PENDING', 'REJECTED'] as const)('rejects a %s report as a candidate search target', async (status) => {
    const { reports, search } = context();
    reports.seedReport(report({ id: status === 'PENDING' ? pendingReportId : rejectedReportId, status }));

    const response = await search(status === 'PENDING' ? pendingReportId : rejectedReportId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_REPORT_STATE');
  });

  it('requires disaster officer authorization', async () => {
    const { search } = context();
    expect((await search(reportId, 'RESIDENT')).status).toBe(403);
    expect((await request((await import('../../../app.js')).createApp({ config: loadConfig() }))
      .get(`${base}?reportId=${reportId}`)).status).toBe(401);
  });
});
