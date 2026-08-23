import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SafeReport } from '@safealert/contracts';

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

async function createVolunteerToken(
  authRepository: InMemoryAuthRepository,
  role: 'COMMUNITY_VOLUNTEER' | 'DISASTER_OFFICER' | 'RESIDENT',
  email: string
) {
  const user = await authRepository.createUser({
    name: `${role} User`,
    email,
    passwordHash: 'not-used-in-this-test',
    role
  });

  return jwt.sign({ role }, 'test-access-secret', {
    subject: user.id,
    expiresIn: '15m'
  });
}

async function createAuthenticatedUser(
  authRepository: InMemoryAuthRepository,
  role: 'COMMUNITY_VOLUNTEER' | 'DISASTER_OFFICER' | 'RESIDENT',
  email: string
) {
  const user = await authRepository.createUser({
    name: `${role} User`,
    email,
    passwordHash: 'not-used-in-this-test',
    role
  });
  const token = jwt.sign({ role }, 'test-access-secret', {
    subject: user.id,
    expiresIn: '15m'
  });

  return { token, user };
}

function seedReport(
  reportRepository: InMemoryReportRepository,
  overrides: Partial<SafeReport> & Pick<SafeReport, 'id' | 'status' | 'createdAt'>
) {
  const report: SafeReport = {
    id: overrides.id,
    residentId: overrides.residentId ?? 'resident-1',
    hazardType: overrides.hazardType ?? 'FLOOD',
    description: overrides.description ?? 'Water is crossing the roadside drain.',
    severity: overrides.severity ?? 'HIGH',
    location:
      overrides.location ?? {
        type: 'Point',
        coordinates: [79.8612, 6.9271]
      },
    status: overrides.status,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt ?? overrides.createdAt,
    ...(overrides.mediaReference ? { mediaReference: overrides.mediaReference } : {})
  };

  reportRepository.seedReport(report);
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

  it('returns pending community reports for authenticated volunteers only', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const volunteerToken = await createVolunteerToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer@example.com'
    );

    seedReport(reportRepository, {
      id: 'report-pending-new',
      status: 'PENDING',
      createdAt: '2026-08-23T10:05:00.000Z',
      description: 'Flood water is moving across the junction.',
      mediaReference: 'media/reports/flood-water.jpg'
    });
    seedReport(reportRepository, {
      id: 'report-verified',
      status: 'VERIFIED',
      createdAt: '2026-08-23T09:55:00.000Z',
      description: 'This verified report should not be shown.'
    });
    seedReport(reportRepository, {
      id: 'report-pending-earlier',
      status: 'PENDING',
      createdAt: '2026-08-23T09:45:00.000Z',
      severity: 'LOW',
      hazardType: 'BLOCKED_ROAD',
      description: 'Branches are obstructing one side of the road.'
    });
    seedReport(reportRepository, {
      id: 'report-resolved',
      status: 'RESOLVED',
      createdAt: '2026-08-23T09:35:00.000Z'
    });

    const response = await request(app)
      .get('/api/v1/reports/community')
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reports: [
        {
          id: 'report-pending-new',
          hazardType: 'FLOOD',
          description: 'Flood water is moving across the junction.',
          severity: 'HIGH',
          location: {
            type: 'Point',
            coordinates: [79.8612, 6.9271]
          },
          mediaReference: 'media/reports/flood-water.jpg',
          status: 'PENDING',
          createdAt: '2026-08-23T10:05:00.000Z'
        },
        {
          id: 'report-pending-earlier',
          hazardType: 'BLOCKED_ROAD',
          description: 'Branches are obstructing one side of the road.',
          severity: 'LOW',
          location: {
            type: 'Point',
            coordinates: [79.8612, 6.9271]
          },
          status: 'PENDING',
          createdAt: '2026-08-23T09:45:00.000Z'
        }
      ]
    });

    expect(response.body.reports[0].residentId).toBeUndefined();
    expect(response.body.reports[0].updatedAt).toBeUndefined();
  });

  it('requires authentication and the COMMUNITY_VOLUNTEER role for community report retrieval', async () => {
    const { app, authRepository } = createTestContext();
    const residentToken = await createVolunteerToken(authRepository, 'RESIDENT', 'resident-2@example.com');
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-2@example.com'
    );

    const unauthenticated = await request(app).get('/api/v1/reports/community');
    const residentForbidden = await request(app)
      .get('/api/v1/reports/community')
      .set('Authorization', `Bearer ${residentToken}`);
    const officerForbidden = await request(app)
      .get('/api/v1/reports/community')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(unauthenticated.status).toBe(401);
    expect(residentForbidden.status).toBe(403);
    expect(officerForbidden.status).toBe(403);
  });

  it('returns nearby pending community reports within the requested radius ordered nearest first', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const volunteerToken = await createVolunteerToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-nearby@example.com'
    );

    seedReport(reportRepository, {
      id: 'nearby-closest',
      status: 'PENDING',
      createdAt: '2026-08-23T10:10:00.000Z',
      location: {
        type: 'Point',
        coordinates: [79.8615, 6.9273]
      }
    });
    seedReport(reportRepository, {
      id: 'nearby-second',
      status: 'PENDING',
      createdAt: '2026-08-23T10:09:00.000Z',
      location: {
        type: 'Point',
        coordinates: [79.87, 6.93]
      },
      severity: 'MODERATE'
    });
    seedReport(reportRepository, {
      id: 'outside-radius',
      status: 'PENDING',
      createdAt: '2026-08-23T10:08:00.000Z',
      location: {
        type: 'Point',
        coordinates: [79.98, 7.04]
      }
    });
    seedReport(reportRepository, {
      id: 'verified-nearby',
      status: 'VERIFIED',
      createdAt: '2026-08-23T10:07:00.000Z',
      location: {
        type: 'Point',
        coordinates: [79.8616, 6.9274]
      }
    });

    const response = await request(app)
      .get('/api/v1/reports/community')
      .query({
        mode: 'nearby',
        latitude: 6.9271,
        longitude: 79.8612,
        radiusKm: 2
      })
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.reports).toHaveLength(2);
    expect(response.body.reports.map((report: { id: string }) => report.id)).toEqual([
      'nearby-closest',
      'nearby-second'
    ]);
    expect(response.body.reports[0].distanceKm).toBeTypeOf('number');
    expect(response.body.reports[0].distanceKm).toBeLessThanOrEqual(response.body.reports[1].distanceKm);
    expect(response.body.reports.find((report: { id: string }) => report.id === 'outside-radius')).toBeUndefined();
    expect(response.body.reports.find((report: { id: string }) => report.id === 'verified-nearby')).toBeUndefined();
  });

  it('rejects invalid nearby query coordinates and radius values', async () => {
    const { app, authRepository } = createTestContext();
    const volunteerToken = await createVolunteerToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-invalid-query@example.com'
    );

    const invalidLatitude = await request(app)
      .get('/api/v1/reports/community')
      .query({
        mode: 'nearby',
        latitude: 99,
        longitude: 79.8612,
        radiusKm: 5
      })
      .set('Authorization', `Bearer ${volunteerToken}`);
    const invalidLongitude = await request(app)
      .get('/api/v1/reports/community')
      .query({
        mode: 'nearby',
        latitude: 6.9271,
        longitude: -190,
        radiusKm: 5
      })
      .set('Authorization', `Bearer ${volunteerToken}`);
    const invalidRadius = await request(app)
      .get('/api/v1/reports/community')
      .query({
        mode: 'nearby',
        latitude: 6.9271,
        longitude: 79.8612,
        radiusKm: 999
      })
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(invalidLatitude.status).toBe(400);
    expect(invalidLongitude.status).toBe(400);
    expect(invalidRadius.status).toBe(400);
  });

  it('returns a single volunteer-safe community report by id', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const volunteerToken = await createVolunteerToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-details@example.com'
    );

    seedReport(reportRepository, {
      id: 'detail-report-1',
      status: 'PENDING',
      createdAt: '2026-08-23T11:05:00.000Z',
      description: 'Flooding has started to cross the side lane.',
      mediaReference: 'media/reports/flood-detail.jpg'
    });

    const response = await request(app)
      .get('/api/v1/reports/community/detail-report-1')
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      report: {
        id: 'detail-report-1',
        hazardType: 'FLOOD',
        description: 'Flooding has started to cross the side lane.',
        severity: 'HIGH',
        location: {
          type: 'Point',
          coordinates: [79.8612, 6.9271]
        },
        mediaReference: 'media/reports/flood-detail.jpg',
        status: 'PENDING',
        createdAt: '2026-08-23T11:05:00.000Z'
      }
    });
    expect(response.body.report.residentId).toBeUndefined();
  });

  it('verifies a pending report for an authenticated disaster officer', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-verify@example.com'
    );

    seedReport(reportRepository, {
      id: 'verify-me',
      status: 'PENDING',
      createdAt: '2026-08-23T12:00:00.000Z',
      updatedAt: '2026-08-23T12:00:00.000Z',
      description: 'Water is rising near the lower bridge.'
    });

    const response = await request(app)
      .patch('/api/v1/reports/verify-me/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'VERIFY' });

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: 'verify-me',
        status: 'VERIFIED',
        updatedAt: expect.any(String),
        verifiedById: expect.any(String),
        verifiedAt: expect.any(String),
        verificationHistory: [
          expect.objectContaining({
            action: 'VERIFY',
            verifiedById: expect.any(String),
            verifiedAt: expect.any(String)
          })
        ]
      })
    );
  });

  it('returns not found when verifying a missing report', async () => {
    const { app, authRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-missing@example.com'
    );

    const response = await request(app)
      .patch('/api/v1/reports/missing-report/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'VERIFY' });

    expect(response.status).toBe(404);
  });

  it('rejects verification when the report is not pending', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-invalid-state@example.com'
    );

    seedReport(reportRepository, {
      id: 'already-verified',
      status: 'VERIFIED',
      createdAt: '2026-08-23T12:10:00.000Z',
      updatedAt: '2026-08-23T12:10:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/already-verified/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'VERIFY' });

    expect(response.status).toBe(409);
  });

  it('requires authentication to verify a report', async () => {
    const { app } = createTestContext();

    const response = await request(app).patch('/api/v1/reports/verify-me/verification').send({
      action: 'VERIFY'
    });

    expect(response.status).toBe(401);
  });

  it('rejects a pending report using the authenticated disaster officer identity', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject@example.com'
    );

    seedReport(reportRepository, {
      id: 'reject-me',
      residentId: 'resident-evidence-owner',
      status: 'PENDING',
      createdAt: '2026-08-23T13:00:00.000Z',
      updatedAt: '2026-08-23T13:00:00.000Z',
      description: 'The road is reported as blocked near the railway crossing.',
      mediaReference: 'media/reports/road-evidence.jpg'
    });

    const response = await request(app)
      .patch('/api/v1/reports/reject-me/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({
        action: 'REJECT',
        rejectionReason: '  The submitted photo shows an unrelated location.  ',
        rejectedById: 'client-supplied-officer-id'
      });

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: 'reject-me',
        residentId: 'resident-evidence-owner',
        description: 'The road is reported as blocked near the railway crossing.',
        mediaReference: 'media/reports/road-evidence.jpg',
        status: 'REJECTED',
        updatedAt: expect.any(String),
        rejectedById: officer.user.id,
        rejectedAt: expect.any(String),
        rejectionReason: 'The submitted photo shows an unrelated location.',
        verificationHistory: [
          expect.objectContaining({
            action: 'REJECT',
            rejectedById: officer.user.id,
            rejectedAt: expect.any(String),
            rejectionReason: 'The submitted photo shows an unrelated location.'
          })
        ]
      })
    );
  });

  it('returns not found when rejecting a missing report', async () => {
    const { app, authRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject-missing@example.com'
    );

    const response = await request(app)
      .patch('/api/v1/reports/missing-report/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT', rejectionReason: 'The evidence does not match the report.' });

    expect(response.status).toBe(404);
  });

  it.each(['VERIFIED', 'REJECTED'] as const)(
    'rejects rejection when the report is already %s',
    async (status) => {
      const { app, authRepository, reportRepository } = createTestContext();
      const officerToken = await createVolunteerToken(
        authRepository,
        'DISASTER_OFFICER',
        `officer-reject-${status.toLowerCase()}@example.com`
      );

      seedReport(reportRepository, {
        id: `reject-invalid-${status.toLowerCase()}`,
        status,
        createdAt: '2026-08-23T13:10:00.000Z',
        updatedAt: '2026-08-23T13:10:00.000Z'
      });

      const response = await request(app)
        .patch(`/api/v1/reports/reject-invalid-${status.toLowerCase()}/verification`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ action: 'REJECT', rejectionReason: 'The evidence is unreliable.' });

      expect(response.status).toBe(409);
    }
  );

  it('requires a non-empty rejection reason', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject-empty-reason@example.com'
    );

    seedReport(reportRepository, {
      id: 'reject-without-reason',
      status: 'PENDING',
      createdAt: '2026-08-23T13:20:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/reject-without-reason/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT', rejectionReason: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Rejection reason is required.'
      }
    });
  });

  it('requires a rejection reason in the request', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject-missing-reason@example.com'
    );

    seedReport(reportRepository, {
      id: 'reject-missing-reason',
      status: 'PENDING',
      createdAt: '2026-08-23T13:25:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/reject-missing-reason/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT' });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Rejection reason is required.'
    });
  });

  it('rejects a rejection reason shorter than 10 trimmed characters', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject-short-reason@example.com'
    );

    seedReport(reportRepository, {
      id: 'reject-short-reason',
      status: 'PENDING',
      createdAt: '2026-08-23T13:30:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/reject-short-reason/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT', rejectionReason: '  Too short  ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Rejection reason must be at least 10 characters.'
    });
  });

  it('rejects a rejection reason longer than 500 trimmed characters', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reject-long-reason@example.com'
    );

    seedReport(reportRepository, {
      id: 'reject-long-reason',
      status: 'PENDING',
      createdAt: '2026-08-23T13:35:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/reject-long-reason/verification')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT', rejectionReason: ` ${'a'.repeat(501)} ` });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Rejection reason must be at most 500 characters.'
    });
  });

  it.each([
    ['minimum', ` ${'a'.repeat(10)} `, 'a'.repeat(10)],
    ['maximum', ` ${'a'.repeat(500)} `, 'a'.repeat(500)]
  ])('accepts the %s rejection reason boundary after trimming', async (boundary, reason, expectedReason) => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      `officer-reject-${boundary}-boundary@example.com`
    );
    const reportId = `reject-${boundary}-boundary`;

    seedReport(reportRepository, {
      id: reportId,
      status: 'PENDING',
      createdAt: '2026-08-23T13:40:00.000Z'
    });

    const response = await request(app)
      .patch(`/api/v1/reports/${reportId}/verification`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ action: 'REJECT', rejectionReason: reason });

    expect(response.status).toBe(200);
    expect(response.body.report.rejectionReason).toBe(expectedReason);
  });

  it('requires authentication to reject a report', async () => {
    const { app } = createTestContext();

    const response = await request(app).patch('/api/v1/reports/reject-me/verification').send({
      action: 'REJECT',
      rejectionReason: 'The evidence is unreliable.'
    });

    expect(response.status).toBe(401);
  });

  it('requires the disaster officer role to reject a report', async () => {
    const { app, authRepository } = createTestContext();
    const residentToken = await createVolunteerToken(
      authRepository,
      'RESIDENT',
      'resident-reject-attempt@example.com'
    );

    const response = await request(app)
      .patch('/api/v1/reports/reject-me/verification')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ action: 'REJECT', rejectionReason: 'The evidence is unreliable.' });

    expect(response.status).toBe(403);
  });
});
