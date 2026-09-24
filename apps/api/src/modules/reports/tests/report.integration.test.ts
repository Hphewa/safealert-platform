import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ReportReviewRequest, SafeReport, UserRole } from '@safealert/contracts';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../repositories/inMemoryReport.repository.js';
import { InMemoryFieldConfirmationRepository } from '../../field-confirmations/repositories/inMemoryFieldConfirmation.repository.js';

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
  const app = createApp({ config, authRepository, reportRepository, fieldConfirmationRepository: new InMemoryFieldConfirmationRepository() });

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
  role: UserRole,
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
  role: UserRole,
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
  mediaReference: '/api/v1/media/report-evidence/flood-photo.jpg'
};

const forbiddenReportReviewCases = [
  ['RESIDENT', 'VERIFY', { action: 'VERIFY' }],
  ['COMMUNITY_VOLUNTEER', 'VERIFY', { action: 'VERIFY' }],
  ['EMERGENCY_RESPONDER', 'VERIFY', { action: 'VERIFY' }],
  ['RESIDENT', 'REJECT', { action: 'REJECT', rejectionReason: 'The evidence is unreliable.' }],
  [
    'COMMUNITY_VOLUNTEER',
    'REJECT',
    { action: 'REJECT', rejectionReason: 'The evidence is unreliable.' }
  ],
  ['EMERGENCY_RESPONDER', 'REJECT', { action: 'REJECT', rejectionReason: 'The evidence is unreliable.' }]
] as const satisfies ReadonlyArray<readonly [UserRole, ReportReviewRequest['action'], ReportReviewRequest]>;

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
    expect(Date.parse(response.body.report.createdAt)).not.toBeNaN();
    expect(response.body.report.updatedAt).toBe(response.body.report.createdAt);
  });

  it.each([
    [
      'VERIFIED',
      {
        verifiedById: 'client-supplied-officer-id',
        verifiedAt: '2000-01-01T00:00:00.000Z'
      }
    ],
    [
      'REJECTED',
      {
        rejectedById: 'client-supplied-officer-id',
        rejectedAt: '2000-01-01T00:00:00.000Z',
        rejectionReason: 'Client supplied rejection reason.'
      }
    ]
  ] as const)(
    'does not allow resident report creation to set %s status or audit identity',
    async (status, auditFields) => {
      const { app } = createTestContext();
      const resident = await registerResident(app);

      const response = await request(app)
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${resident.body.accessToken}`)
        .send({
          ...validReportPayload,
          status,
          ...auditFields
        });

      expect(response.status).toBe(201);
      expect(response.body.report.status).toBe('PENDING');
      expect(response.body.report.verifiedById).toBeUndefined();
      expect(response.body.report.verifiedAt).toBeUndefined();
      expect(response.body.report.rejectedById).toBeUndefined();
      expect(response.body.report.rejectedAt).toBeUndefined();
      expect(response.body.report.rejectionReason).toBeUndefined();
      expect(response.body.report.verificationHistory).toBeUndefined();
    }
  );

  it('ignores all client-supplied owner, status, review, and timestamp fields during resident creation', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validReportPayload,
        residentId: 'client-resident-id',
        status: 'RESOLVED',
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
        verifiedById: 'client-officer-id',
        verifiedAt: '2000-01-01T00:00:00.000Z',
        rejectedById: 'client-officer-id',
        rejectedAt: '2000-01-01T00:00:00.000Z',
        rejectionReason: 'Client supplied rejection reason.',
        verificationHistory: [
          {
            action: 'REJECT',
            rejectedById: 'client-officer-id',
            rejectedAt: '2000-01-01T00:00:00.000Z',
            rejectionReason: 'Client supplied rejection reason.'
          }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        residentId: resident.body.user.id,
        status: 'PENDING',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    expect(response.body.report.residentId).not.toBe('client-resident-id');
    expect(response.body.report.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(response.body.report.updatedAt).toBe(response.body.report.createdAt);
    expect(response.body.report.verifiedById).toBeUndefined();
    expect(response.body.report.verifiedAt).toBeUndefined();
    expect(response.body.report.rejectedById).toBeUndefined();
    expect(response.body.report.rejectedAt).toBeUndefined();
    expect(response.body.report.rejectionReason).toBeUndefined();
    expect(response.body.report.verificationHistory).toBeUndefined();
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

  it('rejects local file URIs as report media references', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validReportPayload,
        mediaReference: 'file:///resident-device/photo.jpg'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Media reference must point to uploaded evidence.'
    });
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


  it('returns only the authenticated resident reports from GET /mine ordered newest first', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const residentA = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-mine-a@example.com'
    );
    const residentB = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-mine-b@example.com'
    );

    seedReport(reportRepository, {
      id: 'resident-a-older-report',
      residentId: residentA.user.id,
      status: 'PENDING',
      createdAt: '2026-08-23T10:00:00.000Z',
      description: 'Older flood report from Resident A.'
    });
    seedReport(reportRepository, {
      id: 'resident-b-report',
      residentId: residentB.user.id,
      status: 'PENDING',
      createdAt: '2026-08-23T11:00:00.000Z',
      description: 'Resident B report must not appear.'
    });
    seedReport(reportRepository, {
      id: 'resident-a-newer-report',
      residentId: residentA.user.id,
      status: 'VERIFIED',
      createdAt: '2026-08-23T12:00:00.000Z',
      description: 'Newer verified report from Resident A.',
      mediaReference: 'media/reports/resident-a-newer.jpg'
    });

    const response = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${residentA.token}`);

    expect(response.status).toBe(200);
    expect(response.body.reports.map((report: SafeReport) => report.id)).toEqual([
      'resident-a-newer-report',
      'resident-a-older-report'
    ]);
    expect(response.body.reports).toEqual([
      expect.objectContaining({
        id: 'resident-a-newer-report',
        residentId: residentA.user.id,
        status: 'VERIFIED',
        description: 'Newer verified report from Resident A.',
        mediaReference: 'media/reports/resident-a-newer.jpg'
      }),
      expect.objectContaining({
        id: 'resident-a-older-report',
        residentId: residentA.user.id,
        status: 'PENDING',
        description: 'Older flood report from Resident A.'
      })
    ]);
    expect(response.body.reports.find((report: SafeReport) => report.id === 'resident-b-report')).toBeUndefined();
  });

  it('returns an empty resident report list when the authenticated resident has no reports', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-empty-mine@example.com'
    );

    seedReport(reportRepository, {
      id: 'other-resident-only-report',
      residentId: 'other-resident-id',
      status: 'PENDING',
      createdAt: '2026-08-23T10:00:00.000Z'
    });

    const response = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reports: [] });
  });

  it('returns resident-owned report detail from GET /mine/:reportId', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-detail-mine@example.com'
    );

    seedReport(reportRepository, {
      id: 'resident-owned-detail',
      residentId: resident.user.id,
      hazardType: 'LANDSLIDE',
      severity: 'MODERATE',
      description: 'Soil has slipped across the small hillside road.',
      status: 'PENDING',
      createdAt: '2026-08-23T12:10:00.000Z',
      updatedAt: '2026-08-23T12:11:00.000Z',
      mediaReference: 'media/reports/landslide-detail.jpg'
    });

    const response = await request(app)
      .get('/api/v1/reports/mine/resident-owned-detail')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: 'resident-owned-detail',
        residentId: resident.user.id,
        hazardType: 'LANDSLIDE',
        severity: 'MODERATE',
        description: 'Soil has slipped across the small hillside road.',
        location: {
          type: 'Point',
          coordinates: [79.8612, 6.9271]
        },
        mediaReference: 'media/reports/landslide-detail.jpg',
        status: 'PENDING',
        createdAt: '2026-08-23T12:10:00.000Z',
        updatedAt: '2026-08-23T12:11:00.000Z'
      })
    );
  });

  it('does not let one resident retrieve another resident report by id', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const residentA = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-foreign-a@example.com'
    );
    const residentB = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-foreign-b@example.com'
    );

    seedReport(reportRepository, {
      id: 'resident-a-private-report',
      residentId: residentA.user.id,
      status: 'PENDING',
      createdAt: '2026-08-23T12:20:00.000Z'
    });

    const response = await request(app)
      .get('/api/v1/reports/mine/resident-a-private-report')
      .set('Authorization', `Bearer ${residentB.token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'REPORT_NOT_FOUND',
      message: 'Report not found.'
    });
  });

  it('returns not found for a nonexistent resident-owned report id', async () => {
    const { app, authRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-missing-detail@example.com'
    );

    const response = await request(app)
      .get('/api/v1/reports/mine/missing-resident-report')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'REPORT_NOT_FOUND',
      message: 'Report not found.'
    });
  });

  it('protects resident report reads with authentication and resident-only RBAC', async () => {
    const { app, authRepository } = createTestContext();
    const volunteerToken = await createVolunteerToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-resident-read-attempt@example.com'
    );
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-resident-read-attempt@example.com'
    );

    const unauthenticated = await request(app).get('/api/v1/reports/mine');
    const volunteerForbidden = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${volunteerToken}`);
    const officerForbidden = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(unauthenticated.status).toBe(401);
    expect(volunteerForbidden.status).toBe(403);
    expect(officerForbidden.status).toBe(403);
  });

  it('returns the current VERIFIED status after an officer verifies a resident report', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-verified-status@example.com'
    );
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-verified-status@example.com'
    );

    seedReport(reportRepository, {
      id: 'resident-report-to-verify',
      residentId: resident.user.id,
      status: 'PENDING',
      createdAt: '2026-08-23T12:30:00.000Z'
    });

    const reviewResponse = await request(app)
      .patch('/api/v1/reports/resident-report-to-verify/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'VERIFY' });
    const residentDetail = await request(app)
      .get('/api/v1/reports/mine/resident-report-to-verify')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(reviewResponse.status).toBe(200);
    expect(residentDetail.status).toBe(200);
    expect(residentDetail.body.report).toEqual(
      expect.objectContaining({
        id: 'resident-report-to-verify',
        residentId: resident.user.id,
        status: 'VERIFIED',
        verifiedById: officer.user.id,
        verifiedAt: reviewResponse.body.report.verifiedAt,
        verificationHistory: [
          {
            action: 'VERIFY',
            verifiedById: officer.user.id,
            verifiedAt: reviewResponse.body.report.verifiedAt
          }
        ]
      })
    );
  });

  it('returns REJECTED and rejectionReason after an officer rejects a resident report', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-rejected-status@example.com'
    );
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-rejected-status@example.com'
    );

    seedReport(reportRepository, {
      id: 'resident-report-to-reject',
      residentId: resident.user.id,
      status: 'PENDING',
      createdAt: '2026-08-23T12:40:00.000Z'
    });

    const reviewResponse = await request(app)
      .patch('/api/v1/reports/resident-report-to-reject/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'REJECT', rejectionReason: 'The submitted evidence shows a different location.' });
    const residentDetail = await request(app)
      .get('/api/v1/reports/mine/resident-report-to-reject')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(reviewResponse.status).toBe(200);
    expect(residentDetail.status).toBe(200);
    expect(residentDetail.body.report).toEqual(
      expect.objectContaining({
        id: 'resident-report-to-reject',
        residentId: resident.user.id,
        status: 'REJECTED',
        rejectedById: officer.user.id,
        rejectedAt: reviewResponse.body.report.rejectedAt,
        rejectionReason: 'The submitted evidence shows a different location.',
        verificationHistory: [
          {
            action: 'REJECT',
            rejectedById: officer.user.id,
            rejectedAt: reviewResponse.body.report.rejectedAt,
            rejectionReason: 'The submitted evidence shows a different location.'
          }
        ]
      })
    );
  });

  it('keeps the resident tracking flow pending after volunteer confirmation and verified only after officer review', async () => {
    const { app, authRepository } = createTestContext();
    const residentA = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-flow-a@example.com'
    );
    const residentB = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-flow-b@example.com'
    );
    const volunteer = await createAuthenticatedUser(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-flow-a@example.com'
    );
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-flow-a@example.com'
    );

    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${residentA.token}`)
      .send({
        ...validReportPayload,
        description: 'Water is rising near the bridge for the verified flow.'
      });
    const reportId = created.body.report.id as string;

    expect(created.status).toBe(201);
    expect(created.body.report).toEqual(
      expect.objectContaining({ residentId: residentA.user.id, status: 'PENDING' })
    );

    const residentAList = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${residentA.token}`);
    const residentBList = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${residentB.token}`);
    const residentBForeignDetail = await request(app)
      .get(`/api/v1/reports/mine/${reportId}`)
      .set('Authorization', `Bearer ${residentB.token}`);

    expect(residentAList.status).toBe(200);
    expect(residentAList.body.reports.map((report: SafeReport) => report.id)).toContain(reportId);
    expect(residentBList.status).toBe(200);
    expect(residentBList.body.reports.map((report: SafeReport) => report.id)).not.toContain(reportId);
    expect(residentBForeignDetail.status).toBe(404);

    const volunteerIncoming = await request(app)
      .get('/api/v1/reports/community')
      .set('Authorization', `Bearer ${volunteer.token}`);
    const volunteerDetail = await request(app)
      .get(`/api/v1/reports/community/${reportId}`)
      .set('Authorization', `Bearer ${volunteer.token}`);

    expect(volunteerIncoming.status).toBe(200);
    expect(volunteerIncoming.body.reports.map((report: { id: string }) => report.id)).toContain(reportId);
    expect(volunteerDetail.status).toBe(200);

    const confirmation = await request(app)
      .post(`/api/v1/field-confirmations/${reportId}/confirm`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({});
    const residentAfterVolunteer = await request(app)
      .get(`/api/v1/reports/mine/${reportId}`)
      .set('Authorization', `Bearer ${residentA.token}`);

    expect(confirmation.status).toBe(201);
    expect(confirmation.body.confirmation).toEqual(
      expect.objectContaining({
        reportId,
        volunteerId: volunteer.user.id,
        outcome: 'CONFIRMED',
        status: 'PENDING'
      })
    );
    expect(residentAfterVolunteer.status).toBe(200);
    expect(residentAfterVolunteer.body.report.status).toBe('PENDING');

    const officerReview = await request(app)
      .patch(`/api/v1/reports/${reportId}/verification`)
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'VERIFY' });
    const residentAfterVerify = await request(app)
      .get(`/api/v1/reports/mine/${reportId}`)
      .set('Authorization', `Bearer ${residentA.token}`);

    expect(officerReview.status).toBe(200);
    expect(officerReview.body.report.status).toBe('VERIFIED');
    expect(residentAfterVerify.status).toBe(200);
    expect(residentAfterVerify.body.report).toEqual(
      expect.objectContaining({
        id: reportId,
        residentId: residentA.user.id,
        status: 'VERIFIED',
        verifiedById: officer.user.id,
        verifiedAt: officerReview.body.report.verifiedAt
      })
    );
  });

  it('keeps volunteer unable-to-confirm separate from report status until officer rejection', async () => {
    const { app, authRepository } = createTestContext();
    const resident = await createAuthenticatedUser(
      authRepository,
      'RESIDENT',
      'resident-flow-b-reject@example.com'
    );
    const volunteer = await createAuthenticatedUser(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-flow-b-reject@example.com'
    );
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-flow-b-reject@example.com'
    );
    const rejectionReason = 'The submitted evidence shows a different location.';

    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${resident.token}`)
      .send({
        ...validReportPayload,
        hazardType: 'BLOCKED_ROAD',
        severity: 'MODERATE',
        description: 'A blocked road report for the rejection flow.'
      });
    const reportId = created.body.report.id as string;

    expect(created.status).toBe(201);
    expect(created.body.report.status).toBe('PENDING');

    const unableToConfirm = await request(app)
      .post(`/api/v1/field-confirmations/${reportId}/unable-to-confirm`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .send({ reason: 'Location does not match' });
    const residentAfterVolunteer = await request(app)
      .get(`/api/v1/reports/mine/${reportId}`)
      .set('Authorization', `Bearer ${resident.token}`);

    expect(unableToConfirm.status).toBe(201);
    expect(unableToConfirm.body.confirmation).toEqual(
      expect.objectContaining({
        reportId,
        volunteerId: volunteer.user.id,
        outcome: 'UNABLE_TO_CONFIRM',
        reason: 'Location does not match',
        status: 'PENDING'
      })
    );
    expect(residentAfterVolunteer.status).toBe(200);
    expect(residentAfterVolunteer.body.report.status).toBe('PENDING');

    const officerReview = await request(app)
      .patch(`/api/v1/reports/${reportId}/verification`)
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'REJECT', rejectionReason });
    const residentAfterReject = await request(app)
      .get(`/api/v1/reports/mine/${reportId}`)
      .set('Authorization', `Bearer ${resident.token}`);
    const residentListAfterReject = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${resident.token}`);

    expect(officerReview.status).toBe(200);
    expect(officerReview.body.report).toEqual(
      expect.objectContaining({ status: 'REJECTED', rejectedById: officer.user.id, rejectionReason })
    );
    expect(residentAfterReject.status).toBe(200);
    expect(residentAfterReject.body.report).toEqual(
      expect.objectContaining({
        id: reportId,
        residentId: resident.user.id,
        status: 'REJECTED',
        rejectedById: officer.user.id,
        rejectedAt: officerReview.body.report.rejectedAt,
        rejectionReason
      })
    );
    expect(residentListAfterReject.status).toBe(200);
    expect(residentListAfterReject.body.reports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: reportId, status: 'REJECTED', rejectionReason })])
    );
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

  it('lists only pending reports for an authenticated disaster officer', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-pending-list@example.com'
    );

    seedReport(reportRepository, {
      id: 'officer-pending-report',
      residentId: 'resident-for-officer',
      status: 'PENDING',
      createdAt: '2026-08-23T11:30:00.000Z',
      updatedAt: '2026-08-23T11:35:00.000Z',
      description: 'Flood water is crossing the access road.',
      mediaReference: 'https://example.com/evidence.jpg'
    });
    seedReport(reportRepository, {
      id: 'officer-verified-report',
      status: 'VERIFIED',
      createdAt: '2026-08-23T11:20:00.000Z'
    });

    const response = await request(app)
      .get('/api/v1/reports/officer/pending')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.reports).toEqual([
      expect.objectContaining({
        id: 'officer-pending-report',
        residentId: 'resident-for-officer',
        status: 'PENDING',
        description: 'Flood water is crossing the access road.',
        mediaReference: 'https://example.com/evidence.jpg',
        updatedAt: '2026-08-23T11:35:00.000Z'
      })
    ]);
  });

  it('returns pending report details for an authenticated disaster officer', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-pending-detail@example.com'
    );

    seedReport(reportRepository, {
      id: 'officer-report-detail',
      residentId: 'resident-detail-owner',
      status: 'PENDING',
      createdAt: '2026-08-23T11:45:00.000Z',
      description: 'Debris has blocked both lanes near the bridge.'
    });

    const response = await request(app)
      .get('/api/v1/reports/officer/officer-report-detail')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: 'officer-report-detail',
        residentId: 'resident-detail-owner',
        status: 'PENDING',
        description: 'Debris has blocked both lanes near the bridge.'
      })
    );
  });

  it('completes the Officer pending report verification flow', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-complete-verify-flow@example.com'
    );

    seedReport(reportRepository, {
      id: 'complete-verify-flow',
      residentId: 'resident-verify-evidence-owner',
      hazardType: 'FLOOD',
      description: 'Flood water is covering the approach road beside the river.',
      severity: 'HIGH',
      location: {
        type: 'Point',
        coordinates: [79.8612, 6.9271]
      },
      mediaReference: 'media/reports/complete-verify-evidence.jpg',
      status: 'PENDING',
      createdAt: '2026-08-23T11:46:00.000Z',
      updatedAt: '2026-08-23T11:48:00.000Z'
    });
    seedReport(reportRepository, {
      id: 'verify-flow-pending-control',
      status: 'PENDING',
      createdAt: '2026-08-23T11:00:00.000Z'
    });

    const pendingBeforeReview = await request(app)
      .get('/api/v1/reports/officer/pending')
      .set('Authorization', `Bearer ${officer.token}`);
    const detailsBeforeReview = await request(app)
      .get('/api/v1/reports/officer/complete-verify-flow')
      .set('Authorization', `Bearer ${officer.token}`);

    expect(pendingBeforeReview.status).toBe(200);
    expect(pendingBeforeReview.body.reports).toHaveLength(2);
    expect(pendingBeforeReview.body.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
        id: 'complete-verify-flow',
        hazardType: 'FLOOD',
        description: 'Flood water is covering the approach road beside the river.',
        severity: 'HIGH',
        location: {
          type: 'Point',
          coordinates: [79.8612, 6.9271]
        },
        updatedAt: '2026-08-23T11:48:00.000Z'
        })
      ])
    );
    expect(detailsBeforeReview.status).toBe(200);
    expect(detailsBeforeReview.body.report).toEqual(
      expect.objectContaining({
        residentId: 'resident-verify-evidence-owner',
        description: 'Flood water is covering the approach road beside the river.',
        mediaReference: 'media/reports/complete-verify-evidence.jpg',
        status: 'PENDING'
      })
    );

    const reviewStartedAt = Date.now();
    const reviewResponse = await request(app)
      .patch('/api/v1/reports/complete-verify-flow/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'VERIFY' });
    const reviewCompletedAt = Date.now();
    const pendingAfterReview = await request(app)
      .get('/api/v1/reports/officer/pending')
      .set('Authorization', `Bearer ${officer.token}`);
    const detailsAfterReview = await request(app)
      .get('/api/v1/reports/officer/complete-verify-flow')
      .set('Authorization', `Bearer ${officer.token}`);
    const storedReport = await reportRepository.findReportById('complete-verify-flow');
    const verifiedAt = reviewResponse.body.report.verifiedAt as string;
    const verifiedAtMs = Date.parse(verifiedAt);

    expect(reviewResponse.status).toBe(200);
    expect(verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(verifiedAtMs).toBeGreaterThanOrEqual(reviewStartedAt);
    expect(verifiedAtMs).toBeLessThanOrEqual(reviewCompletedAt);
    expect(reviewResponse.body.report.updatedAt).toBe(verifiedAt);
    expect(reviewResponse.body.report.verificationHistory).toEqual([
      {
        action: 'VERIFY',
        verifiedById: officer.user.id,
        verifiedAt
      }
    ]);
    expect(pendingAfterReview.status).toBe(200);
    expect(pendingAfterReview.body.reports.map((report: SafeReport) => report.id)).toEqual([
      'verify-flow-pending-control'
    ]);
    expect(detailsAfterReview.status).toBe(404);
    expect(storedReport).toEqual({
      id: 'complete-verify-flow',
      residentId: 'resident-verify-evidence-owner',
      hazardType: 'FLOOD',
      description: 'Flood water is covering the approach road beside the river.',
      severity: 'HIGH',
      location: {
        type: 'Point',
        coordinates: [79.8612, 6.9271]
      },
      mediaReference: 'media/reports/complete-verify-evidence.jpg',
      status: 'VERIFIED',
      createdAt: '2026-08-23T11:46:00.000Z',
      updatedAt: verifiedAt,
      verifiedById: officer.user.id,
      verifiedAt,
      verificationHistory: [
        {
          action: 'VERIFY',
          verifiedById: officer.user.id,
          verifiedAt
        }
      ]
    });
  });

  it('completes the Officer rejection flow only after a valid reason', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-complete-reject-flow@example.com'
    );

    seedReport(reportRepository, {
      id: 'complete-reject-flow',
      residentId: 'resident-reject-evidence-owner',
      hazardType: 'BLOCKED_ROAD',
      description: 'A resident reported a fallen tree blocking both traffic lanes.',
      severity: 'MODERATE',
      location: {
        type: 'Point',
        coordinates: [80.6337, 7.2906]
      },
      mediaReference: 'media/reports/complete-reject-evidence.jpg',
      status: 'PENDING',
      createdAt: '2026-08-23T11:49:00.000Z'
    });
    seedReport(reportRepository, {
      id: 'reject-flow-pending-control',
      status: 'PENDING',
      createdAt: '2026-08-23T11:01:00.000Z'
    });

    const invalidReasonResponse = await request(app)
      .patch('/api/v1/reports/complete-reject-flow/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'REJECT', rejectionReason: '   ' });
    const reportAfterInvalidReason = await reportRepository.findReportById('complete-reject-flow');

    expect(invalidReasonResponse.status).toBe(400);
    expect(invalidReasonResponse.body.error).toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Rejection reason is required.'
      })
    );
    expect(reportAfterInvalidReason?.status).toBe('PENDING');
    expect(reportAfterInvalidReason).not.toHaveProperty('rejectedById');
    expect(reportAfterInvalidReason).not.toHaveProperty('rejectedAt');
    expect(reportAfterInvalidReason).not.toHaveProperty('rejectionReason');
    expect(reportAfterInvalidReason).not.toHaveProperty('verificationHistory');

    const reviewStartedAt = Date.now();
    const reviewResponse = await request(app)
      .patch('/api/v1/reports/complete-reject-flow/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({
        action: 'REJECT',
        rejectionReason: '  The photo shows a different road and no obstruction.  '
      });
    const reviewCompletedAt = Date.now();
    const pendingAfterReview = await request(app)
      .get('/api/v1/reports/officer/pending')
      .set('Authorization', `Bearer ${officer.token}`);
    const detailsAfterReview = await request(app)
      .get('/api/v1/reports/officer/complete-reject-flow')
      .set('Authorization', `Bearer ${officer.token}`);
    const storedReport = await reportRepository.findReportById('complete-reject-flow');
    const rejectedAt = reviewResponse.body.report.rejectedAt as string;
    const rejectedAtMs = Date.parse(rejectedAt);

    expect(reviewResponse.status).toBe(200);
    expect(rejectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(rejectedAtMs).toBeGreaterThanOrEqual(reviewStartedAt);
    expect(rejectedAtMs).toBeLessThanOrEqual(reviewCompletedAt);
    expect(reviewResponse.body.report.updatedAt).toBe(rejectedAt);
    expect(reviewResponse.body.report.rejectionReason).toBe(
      'The photo shows a different road and no obstruction.'
    );
    expect(reviewResponse.body.report.verificationHistory).toEqual([
      {
        action: 'REJECT',
        rejectedById: officer.user.id,
        rejectedAt,
        rejectionReason: 'The photo shows a different road and no obstruction.'
      }
    ]);
    expect(pendingAfterReview.status).toBe(200);
    expect(pendingAfterReview.body.reports.map((report: SafeReport) => report.id)).toEqual([
      'reject-flow-pending-control'
    ]);
    expect(detailsAfterReview.status).toBe(404);
    expect(storedReport).toEqual({
      id: 'complete-reject-flow',
      residentId: 'resident-reject-evidence-owner',
      hazardType: 'BLOCKED_ROAD',
      description: 'A resident reported a fallen tree blocking both traffic lanes.',
      severity: 'MODERATE',
      location: {
        type: 'Point',
        coordinates: [80.6337, 7.2906]
      },
      mediaReference: 'media/reports/complete-reject-evidence.jpg',
      status: 'REJECTED',
      createdAt: '2026-08-23T11:49:00.000Z',
      updatedAt: rejectedAt,
      rejectedById: officer.user.id,
      rejectedAt,
      rejectionReason: 'The photo shows a different road and no obstruction.',
      verificationHistory: [
        {
          action: 'REJECT',
          rejectedById: officer.user.id,
          rejectedAt,
          rejectionReason: 'The photo shows a different road and no obstruction.'
        }
      ]
    });
  });

  it('does not return a reviewed report through the officer pending detail endpoint', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officerToken = await createVolunteerToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-reviewed-detail@example.com'
    );

    seedReport(reportRepository, {
      id: 'officer-reviewed-detail',
      status: 'VERIFIED',
      createdAt: '2026-08-23T11:50:00.000Z'
    });

    const response = await request(app)
      .get('/api/v1/reports/officer/officer-reviewed-detail')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(response.status).toBe(404);
  });

  it('protects officer report reads with authentication and disaster officer RBAC', async () => {
    const { app, authRepository } = createTestContext();
    const residentToken = await createVolunteerToken(
      authRepository,
      'RESIDENT',
      'resident-officer-read-attempt@example.com'
    );

    const unauthenticated = await request(app).get('/api/v1/reports/officer/pending');
    const forbidden = await request(app)
      .get('/api/v1/reports/officer/pending')
      .set('Authorization', `Bearer ${residentToken}`);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it.each(forbiddenReportReviewCases)(
    'returns 403 when a %s user attempts to %s a report',
    async (role, action, reviewRequest) => {
      const { app, authRepository, reportRepository } = createTestContext();
      const reportId = `forbidden-${role.toLowerCase()}-${action.toLowerCase()}`;
      const token = await createVolunteerToken(
        authRepository,
        role,
        `${role.toLowerCase()}-${action.toLowerCase()}-review-attempt@example.com`
      );

      seedReport(reportRepository, {
        id: reportId,
        status: 'PENDING',
        createdAt: '2026-08-23T11:55:00.000Z'
      });

      const response = await request(app)
        .patch(`/api/v1/reports/${reportId}/verification`)
        .set('Authorization', `Bearer ${token}`)
        .send(reviewRequest);
      const unchangedReport = await reportRepository.findReportById(reportId);

      expect(response.status).toBe(403);
      expect(response.body.error).toEqual({
        code: 'FORBIDDEN',
        message: 'You are not allowed to perform this action.'
      });
      expect(unchangedReport).toEqual(
        expect.objectContaining({
          id: reportId,
          status: 'PENDING'
        })
      );
      expect(unchangedReport?.verifiedById).toBeUndefined();
      expect(unchangedReport?.rejectedById).toBeUndefined();
      expect(unchangedReport?.verificationHistory).toBeUndefined();
    }
  );

  it('does not expose a generic report update route that can bypass review authorization', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const residentToken = await createVolunteerToken(
      authRepository,
      'RESIDENT',
      'resident-generic-update-attempt@example.com'
    );
    const reportId = 'generic-status-update-attempt';

    seedReport(reportRepository, {
      id: reportId,
      status: 'PENDING',
      createdAt: '2026-08-23T11:58:00.000Z'
    });

    const patchResponse = await request(app)
      .patch(`/api/v1/reports/${reportId}`)
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ status: 'VERIFIED' });
    const putResponse = await request(app)
      .put(`/api/v1/reports/${reportId}`)
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ status: 'REJECTED' });
    const unchangedReport = await reportRepository.findReportById(reportId);

    expect(patchResponse.status).toBe(404);
    expect(putResponse.status).toBe(404);
    expect(unchangedReport).toEqual(
      expect.objectContaining({
        id: reportId,
        status: 'PENDING'
      })
    );
    expect(unchangedReport?.verifiedById).toBeUndefined();
    expect(unchangedReport?.rejectedById).toBeUndefined();
  });

  it('verifies a pending report for an authenticated disaster officer', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officer = await createAuthenticatedUser(
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
      .set('Authorization', `Bearer ${officer.token}`)
      .send({ action: 'VERIFY' });

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: 'verify-me',
        status: 'VERIFIED',
        updatedAt: expect.any(String),
        verifiedById: officer.user.id,
        verifiedAt: expect.any(String),
        verificationHistory: [
          expect.objectContaining({
            action: 'VERIFY',
            verifiedById: officer.user.id,
            verifiedAt: expect.any(String)
          })
        ]
      })
    );
  });

  it('ignores client-supplied verification status, identity, and timestamps', async () => {
    const { app, authRepository, reportRepository } = createTestContext();
    const officer = await createAuthenticatedUser(
      authRepository,
      'DISASTER_OFFICER',
      'officer-verify-overpost@example.com'
    );

    seedReport(reportRepository, {
      id: 'verify-overpost',
      status: 'PENDING',
      createdAt: '2026-08-23T12:05:00.000Z'
    });

    const response = await request(app)
      .patch('/api/v1/reports/verify-overpost/verification')
      .set('Authorization', `Bearer ${officer.token}`)
      .send({
        action: 'VERIFY',
        status: 'REJECTED',
        verifiedById: 'client-supplied-officer-id',
        verifiedAt: '2000-01-01T00:00:00.000Z',
        rejectedById: 'client-supplied-rejecting-officer-id'
      });
    const storedReport = await reportRepository.findReportById('verify-overpost');

    expect(response.status).toBe(200);
    expect(response.body.report.status).toBe('VERIFIED');
    expect(response.body.report.verifiedById).toBe(officer.user.id);
    expect(response.body.report.verifiedAt).toEqual(expect.any(String));
    expect(response.body.report.verifiedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(response.body.report.rejectedById).toBeUndefined();
    expect(response.body.report.verificationHistory).toEqual([
      {
        action: 'VERIFY',
        verifiedById: officer.user.id,
        verifiedAt: response.body.report.verifiedAt
      }
    ]);
    expect(storedReport).toEqual(
      expect.objectContaining({
        status: 'VERIFIED',
        verifiedById: officer.user.id,
        verifiedAt: response.body.report.verifiedAt,
        verificationHistory: response.body.report.verificationHistory
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

  it.each(['VERIFIED', 'REJECTED'] as const)(
    'rejects verification when the report is already %s',
    async (status) => {
      const { app, authRepository, reportRepository } = createTestContext();
      const officerToken = await createVolunteerToken(
        authRepository,
        'DISASTER_OFFICER',
        `officer-verify-${status.toLowerCase()}@example.com`
      );
      const reportId = `verify-invalid-${status.toLowerCase()}`;

      seedReport(reportRepository, {
        id: reportId,
        status,
        createdAt: '2026-08-23T12:10:00.000Z',
        updatedAt: '2026-08-23T12:10:00.000Z'
      });

      const response = await request(app)
        .patch(`/api/v1/reports/${reportId}/verification`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ action: 'VERIFY' });
      const unchangedReport = await reportRepository.findReportById(reportId);

      expect(response.status).toBe(409);
      expect(unchangedReport?.status).toBe(status);
      expect(unchangedReport?.verificationHistory).toBeUndefined();
    }
  );

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
        status: 'VERIFIED',
        rejectedById: 'client-supplied-officer-id',
        rejectedAt: '2000-01-01T00:00:00.000Z',
        verifiedById: 'client-supplied-verifying-officer-id'
      });
    const storedReport = await reportRepository.findReportById('reject-me');

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
        rejectedAt: response.body.report.rejectedAt,
        rejectionReason: 'The submitted photo shows an unrelated location.',
        verificationHistory: [
          expect.objectContaining({
            action: 'REJECT',
            rejectedById: officer.user.id,
            rejectedAt: response.body.report.rejectedAt,
            rejectionReason: 'The submitted photo shows an unrelated location.'
          })
        ]
      })
    );
    expect(response.body.report.rejectedById).not.toBe('client-supplied-officer-id');
    expect(response.body.report.rejectedAt).toEqual(expect.any(String));
    expect(response.body.report.rejectedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(response.body.report.verifiedById).toBeUndefined();
    expect(storedReport).toEqual(
      expect.objectContaining({
        status: 'REJECTED',
        rejectedById: officer.user.id,
        rejectedAt: response.body.report.rejectedAt,
        rejectionReason: 'The submitted photo shows an unrelated location.',
        verificationHistory: response.body.report.verificationHistory
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
      const unchangedReport = await reportRepository.findReportById(
        `reject-invalid-${status.toLowerCase()}`
      );

      expect(response.status).toBe(409);
      expect(unchangedReport?.status).toBe(status);
      expect(unchangedReport?.verificationHistory).toBeUndefined();
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
