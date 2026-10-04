import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SafeReport } from '@safealert/contracts';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryFieldConfirmationRepository } from '../../field-confirmations/repositories/inMemoryFieldConfirmation.repository.js';
import { InMemoryIncidentRepository } from '../../incidents/repositories/inMemoryIncident.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryCommunityReportClusterRepository } from '../repositories/inMemoryCommunityReportCluster.repository.js';

function context() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '30d';

  const authRepository = new InMemoryAuthRepository();
  const reportRepository = new InMemoryReportRepository();
  const clusterRepository = new InMemoryCommunityReportClusterRepository();
  const app = createApp({
    config: loadConfig(),
    authRepository,
    reportRepository,
    incidentRepository: new InMemoryIncidentRepository(),
    communityReportClusterRepository: clusterRepository,
    fieldConfirmationRepository: new InMemoryFieldConfirmationRepository()
  });

  return { app, authRepository, reportRepository, clusterRepository };
}

async function register(app: ReturnType<typeof createApp>, email: string) {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Resident User',
    email,
    password: 'password123'
  });
}

function payload(overrides: Partial<SafeReport> = {}) {
  return {
    hazardType: overrides.hazardType ?? 'FLOOD',
    description: overrides.description ?? 'Water is crossing the road near the bridge.',
    severity: overrides.severity ?? 'HIGH',
    location: overrides.location ?? { type: 'Point', coordinates: [79.8612, 6.9271] }
  };
}

describe('community report clustering', () => {
  beforeEach(() => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  it('creates a cluster for the first pending report and keeps the report independent', async () => {
    const { app, reportRepository, clusterRepository } = context();
    const resident = await register(app, 'cluster-first@example.com');

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send(payload());

    expect(response.status).toBe(201);
    expect(response.body.report.status).toBe('PENDING');
    expect(response.body.report.communityReportClusterId).toEqual(expect.stringMatching(/^[a-f\d]{24}$/));
    expect(await reportRepository.findReportById(response.body.report.id)).toEqual(response.body.report);
    const cluster = await clusterRepository.findById(response.body.report.communityReportClusterId);
    expect(cluster).toEqual(expect.objectContaining({
      hazardType: 'FLOOD',
      reportCount: 1,
      activeReportCount: 1,
      pendingReportCount: 1,
      highestSeverity: 'HIGH'
    }));
  });

  it('groups nearby same-hazard reports while preserving separate report ids and owners', async () => {
    const { app } = context();
    const residentA = await register(app, 'cluster-a@example.com');
    const residentB = await register(app, 'cluster-b@example.com');

    const first = await request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${residentA.body.accessToken}`)
      .send(payload({ severity: 'LOW' }));
    const second = await request(app).post('/api/v1/reports')
      .set('Authorization', `Bearer ${residentB.body.accessToken}`)
      .send(payload({
        severity: 'HIGH',
        location: { type: 'Point', coordinates: [79.8622, 6.9277] }
      }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.report.id).not.toBe(second.body.report.id);
    expect(first.body.report.residentId).not.toBe(second.body.report.residentId);
    expect(first.body.report.communityReportClusterId).toBe(second.body.report.communityReportClusterId);
    expect(first.body.report.status).toBe('PENDING');
    expect(second.body.report.status).toBe('PENDING');
  });

  it('creates separate clusters for far reports and different hazard types', async () => {
    const { app } = context();
    const resident = await register(app, 'cluster-separate@example.com');
    const auth = `Bearer ${resident.body.accessToken}`;

    const flood = await request(app).post('/api/v1/reports').set('Authorization', auth).send(payload());
    const farFlood = await request(app).post('/api/v1/reports').set('Authorization', auth).send(payload({
      location: { type: 'Point', coordinates: [79.9, 6.95] }
    }));
    const nearbyLandslide = await request(app).post('/api/v1/reports').set('Authorization', auth).send(payload({
      hazardType: 'LANDSLIDE',
      location: { type: 'Point', coordinates: [79.8613, 6.9272] }
    }));

    expect(flood.body.report.communityReportClusterId).not.toBe(farFlood.body.report.communityReportClusterId);
    expect(flood.body.report.communityReportClusterId).not.toBe(nearbyLandslide.body.report.communityReportClusterId);
  });
});

