import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import type { SafeResponseRequest } from '@safealert/contracts';

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
  const responseRequestRepository = new InMemoryResponseRequestRepository();
  const app = createApp({ config, authRepository, reportRepository, responseRequestRepository });

  return { app, authRepository, responseRequestRepository };
}

async function registerResident(app: ReturnType<typeof createApp>) {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Resident User',
    email: 'resident@example.com',
    password: 'password123'
  });
}

async function createAccessToken(
  authRepository: InMemoryAuthRepository,
  role: 'COMMUNITY_VOLUNTEER' | 'DISASTER_OFFICER' | 'EMERGENCY_RESPONDER' | 'RESIDENT',
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

const validResponseRequestPayload = {
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  affectedPeople: 4,
  medicalNeeds: true,
  injuredPeople: 2,
  vulnerablePeople: {
    children: 1,
    elderlyPeople: 1,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  roadAccessibility: 'LIMITED',
  contact: {
    name: 'Resident User',
    phoneNumber: '+94-77-555-1234',
    email: 'resident.contact@example.com'
  },
  description: 'Two people are injured and flood water is rising around the house.',
  specialRequirements: 'Need transport support for one elderly person.'
};

function createStoredResponseRequest(
  overrides: Partial<SafeResponseRequest> = {}
): SafeResponseRequest {
  return {
    id: 'response-request-1',
    residentId: 'resident-1',
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: {
      type: 'Point',
      coordinates: [79.8612, 6.9271]
    },
    affectedPeople: 2,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: {
      children: 0,
      elderlyPeople: 0,
      personsWithDisabilities: 0,
      pregnantPersons: 0
    },
    roadAccessibility: 'LIMITED',
    contact: {
      name: 'Resident User',
      phoneNumber: '+94-77-555-1234'
    },
    description: 'Assistance is needed at the reported location.',
    status: 'NEW',
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides
  };
}

describe('response request API', () => {
  beforeEach(() => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  it('creates a new resident response request using the authenticated resident id', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send(validResponseRequestPayload);

    expect(response.status).toBe(201);
    expect(response.body.responseRequest).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        residentId: resident.body.user.id,
        assistanceType: 'MEDICAL_ASSISTANCE',
        location: validResponseRequestPayload.location,
        affectedPeople: 4,
        medicalNeeds: true,
        injuredPeople: 2,
        vulnerablePeople: validResponseRequestPayload.vulnerablePeople,
        roadAccessibility: 'LIMITED',
        contact: validResponseRequestPayload.contact,
        description: validResponseRequestPayload.description,
        specialRequirements: validResponseRequestPayload.specialRequirements,
        status: 'NEW',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      })
    );
    expect(response.body.responseRequest.status).toBe('NEW');
  });

  it('accepts each supported emergency assistance type', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);
    const assistanceTypes = [
      'RESCUE_EVACUATION',
      'MEDICAL_ASSISTANCE',
      'FLOOD_ASSISTANCE',
      'SHELTER_RELOCATION',
      'OTHER'
    ] as const;

    for (const assistanceType of assistanceTypes) {
      const response = await request(app)
        .post('/api/v1/response-requests')
        .set('Authorization', `Bearer ${resident.body.accessToken}`)
        .send({
          ...validResponseRequestPayload,
          assistanceType,
          description: `${assistanceType} support is urgently needed at this address.`
        });

      expect(response.status).toBe(201);
      expect(response.body.responseRequest.assistanceType).toBe(assistanceType);
      expect(response.body.responseRequest.status).toBe('NEW');
    }
  });

  it('keeps special requirements optional and returns a safe created representation', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        specialRequirements: undefined
      });

    expect(response.status).toBe(201);
    expect(response.body.responseRequest.specialRequirements).toBeUndefined();
    expect(response.body.responseRequest.status).toBe('NEW');
  });

  it('requires authentication and the RESIDENT role', async () => {
    const { app, authRepository } = createTestContext();
    const volunteerToken = await createAccessToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer@example.com'
    );
    const officerToken = await createAccessToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer@example.com'
    );
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'responder@example.com'
    );

    const unauthenticated = await request(app)
      .post('/api/v1/response-requests')
      .send(validResponseRequestPayload);
    const volunteerForbidden = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send(validResponseRequestPayload);
    const officerForbidden = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${officerToken}`)
      .send(validResponseRequestPayload);
    const forbidden = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${responderToken}`)
      .send(validResponseRequestPayload);

    expect(unauthenticated.status).toBe(401);
    expect(volunteerForbidden.status).toBe(403);
    expect(officerForbidden.status).toBe(403);
    expect(forbidden.status).toBe(403);
  });

  it('rejects attempts to set server-controlled or forbidden fields', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const forgedResidentId = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        residentId: 'forged-resident-id'
      });
    const forgedAssignedResponder = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        assignedResponderId: 'responder-123'
      });
    const forgedPriority = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        priorityScore: 999
      });
    const forgedAssignedStatus = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        status: 'ASSIGNED'
      });
    const forgedCompletedStatus = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        status: 'COMPLETED'
      });

    expect(forgedResidentId.status).toBe(400);
    expect(forgedAssignedResponder.status).toBe(400);
    expect(forgedPriority.status).toBe(400);
    expect(forgedAssignedStatus.status).toBe(400);
    expect(forgedCompletedStatus.status).toBe(400);
  });

  it('validates assistance type, GeoJSON location, and required numeric constraints', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const invalidAssistanceType = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, assistanceType: 'FIRE_RESCUE' });
    const invalidLocation = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        location: {
          type: 'Point',
          coordinates: [79.8612, 96]
        }
      });
    const invalidAffectedPeople = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, affectedPeople: 0 });
    const invalidInjuredPeople = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, injuredPeople: -1 });
    const invalidVulnerablePeople = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        vulnerablePeople: {
          ...validResponseRequestPayload.vulnerablePeople,
          elderlyPeople: -1
        }
      });
    const injuredExceedsAffected = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        affectedPeople: 1,
        injuredPeople: 2
      });
    const conflictingMedicalNeeds = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        medicalNeeds: false,
        injuredPeople: 1
      });

    expect(invalidAssistanceType.status).toBe(400);
    expect(invalidLocation.status).toBe(400);
    expect(invalidAffectedPeople.status).toBe(400);
    expect(invalidInjuredPeople.status).toBe(400);
    expect(invalidVulnerablePeople.status).toBe(400);
    expect(injuredExceedsAffected.status).toBe(400);
    expect(conflictingMedicalNeeds.status).toBe(400);
  });

  it('validates required contact, accessibility, description, and location fields', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const missingRoadAccessibility = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, roadAccessibility: undefined });
    const missingContactPhone = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        contact: {
          ...validResponseRequestPayload.contact,
          phoneNumber: ' '
        }
      });
    const missingDescription = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, description: ' ' });
    const missingLocation = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({ ...validResponseRequestPayload, location: undefined });
    const malformedLocation = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        location: {
          type: 'Point',
          coordinates: [79.8612]
        }
      });

    expect(missingRoadAccessibility.status).toBe(400);
    expect(missingContactPhone.status).toBe(400);
    expect(missingDescription.status).toBe(400);
    expect(missingLocation.status).toBe(400);
    expect(malformedLocation.status).toBe(400);
  });

  it('preserves GeoJSON longitude, latitude coordinate order', async () => {
    const { app } = createTestContext();
    const resident = await registerResident(app);

    const response = await request(app)
      .post('/api/v1/response-requests')
      .set('Authorization', `Bearer ${resident.body.accessToken}`)
      .send({
        ...validResponseRequestPayload,
        location: {
          type: 'Point',
          coordinates: [80.7718, 7.8731]
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.responseRequest.location).toEqual({
      type: 'Point',
      coordinates: [80.7718, 7.8731]
    });
  });

  it('allows an Emergency Responder to retrieve only pending NEW requests', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'responder@example.com'
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'pending-request', status: 'NEW' })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'assigned-request', status: 'ASSIGNED' })
    );

    const response = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'pending-request'
    ]);
  });

  it('returns an empty pending queue when no NEW requests exist', async () => {
    const { app, authRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'responder@example.com'
    );

    const response = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('allows an Emergency Responder to retrieve only their assigned requests', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderA = await authRepository.createUser({
      name: 'Responder A User',
      email: 'responder-a@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    const responderAToken = jwt.sign({ role: responderA.role }, 'test-access-secret', {
      subject: responderA.id,
      expiresIn: '15m'
    });
    const responderB = await authRepository.createUser({
      name: 'Responder B User',
      email: 'responder-b@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({
        id: 'responder-a-request',
        status: 'ASSIGNED',
        assignedResponderId: responderA.id
      })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({
        id: 'responder-b-request',
        status: 'ASSIGNED',
        assignedResponderId: responderB.id
      })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'new-request', status: 'NEW' })
    );

    const response = await request(app)
      .get('/api/v1/response-requests/responder/assigned')
      .query({ responderId: responderB.id })
      .set('Authorization', `Bearer ${responderAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'responder-a-request'
    ]);
  });

  it('returns an empty assigned queue when no requests belong to the responder', async () => {
    const { app, authRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'responder@example.com'
    );

    const response = await request(app)
      .get('/api/v1/response-requests/responder/assigned')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('requires authentication and the Emergency Responder role for queue endpoints', async () => {
    const { app, authRepository } = createTestContext();
    const residentToken = await createAccessToken(
      authRepository,
      'RESIDENT',
      'resident-queue@example.com'
    );
    const volunteerToken = await createAccessToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'volunteer-queue@example.com'
    );
    const officerToken = await createAccessToken(
      authRepository,
      'DISASTER_OFFICER',
      'officer-queue@example.com'
    );
    const paths = [
      '/api/v1/response-requests/responder/pending',
      '/api/v1/response-requests/responder/assigned'
    ];

    for (const path of paths) {
      const unauthenticated = await request(app).get(path);
      const residentForbidden = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${residentToken}`);
      const volunteerForbidden = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${volunteerToken}`);
      const officerForbidden = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${officerToken}`);

      expect(unauthenticated.status).toBe(401);
      expect(residentForbidden.status).toBe(403);
      expect(volunteerForbidden.status).toBe(403);
      expect(officerForbidden.status).toBe(403);
    }
  });
});
