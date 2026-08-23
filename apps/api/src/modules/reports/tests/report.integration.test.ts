import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../repositories/inMemoryReport.repository.js';

function createTestContext(overrides: Partial<ApiConfig> = {}) {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '30d';

  const config = {
    ...loadConfig(),
    ...overrides
  };
  const authRepository = new InMemoryAuthRepository();
  const reportRepository = new InMemoryReportRepository();
  const app = createApp({ config, authRepository, reportRepository });

  return { app, authRepository, reportRepository };
}

async function registerResident(app: ReturnType<typeof createApp>) {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Resident User',
    email: 'resident@example.com',
    password: 'password123'
  });
}

const validReportPayload = {
  residentId: 'client-supplied-id-must-be-ignored',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
  severity: 'HIGH',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  mediaReference: 'media/reports/flood-photo.jpg'
};

describe('report API', () => {
  beforeEach(() => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  it('creates a pending resident hazard report using the authenticated resident id', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send(validReportPayload);

    expect(response.status).toBe(201);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        residentId: resident.body.user.id,
        hazardType: 'FLOOD',
        description: validReportPayload.description,
        severity: 'HIGH',
        location: validReportPayload.location,
        mediaReference: validReportPayload.mediaReference,
        status: 'PENDING',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    expect(response.body.report.residentId).not.toBe(validReportPayload.residentId);
  });

  it('accepts each supported resident hazard type', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);
    const hazardTypes = ['FLOOD', 'BLOCKED_ROAD', 'LANDSLIDE', 'OTHER'] as const;

    for (const hazardType of hazardTypes) {
      const response = await request(app)
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${resident.body.accessToken}`)
        .send({
          ...validReportPayload,
          hazardType,
          description: `${hazardType} hazard reported near the main road.`
        });

      expect(response.status).toBe(201);
      expect(response.body.report.hazardType).toBe(hazardType);
      expect(response.body.report.status).toBe('PENDING');
    }
  });

  it('keeps photo evidence optional and does not require a media reference', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);
    const payloadWithoutMedia = {
      residentId: validReportPayload.residentId,
      hazardType: validReportPayload.hazardType,
      description: validReportPayload.description,
      severity: validReportPayload.severity,
      location: validReportPayload.location
    };

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send(payloadWithoutMedia);

    expect(response.status).toBe(201);
    expect(response.body.report.mediaReference).toBeUndefined();
    expect(response.body.report.status).toBe('PENDING');
  });

  it('requires authentication and the RESIDENT role', async () => {
    const { app, authRepository } = createTestContext();
    const officer = await authRepository.createUser({
      name: 'Officer User',
      email: 'officer@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'DISASTER_OFFICER'
    });
    const officerToken = jwt.sign({ role: 'DISASTER_OFFICER' }, 'test-access-secret', {
      subject: officer.id,
      expiresIn: '15m'
    });

    const unauthenticated = await request(app).post('/api/v1/reports').send(validReportPayload);
    const forbidden = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${officerToken}`)
      .send(validReportPayload);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('validates hazard type, severity, description, and GeoJSON point location', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const invalidHazardType = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, hazardType: 'FIRE' });
    const invalidSeverity = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, severity: 'CRITICAL' });
    const invalidDescription = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, description: '  ' });
    const invalidLocation = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validReportPayload,
        location: {
          type: 'Point',
          coordinates: [6.9271, 190]
        }
      });

    expect(invalidHazardType.status).toBe(400);
    expect(invalidSeverity.status).toBe(400);
    expect(invalidDescription.status).toBe(400);
    expect(invalidLocation.status).toBe(400);
  });

  it('rejects missing required report fields with validation errors', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const missingHazardType = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, hazardType: undefined });
    const missingSeverity = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, severity: undefined });
    const missingDescription = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, description: undefined });
    const missingLocation = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validReportPayload, location: undefined });

    expect(missingHazardType.status).toBe(400);
    expect(missingSeverity.status).toBe(400);
    expect(missingDescription.status).toBe(400);
    expect(missingLocation.status).toBe(400);
  });

  it('stores GeoJSON coordinates in longitude, latitude order', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validReportPayload,
        location: {
          type: 'Point',
          coordinates: [80.7718, 7.8731]
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.report.location).toEqual({
      type: 'Point',
      coordinates: [80.7718, 7.8731]
    });
  });

  it('preserves health route behavior', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('safealert-api');
  });
});
