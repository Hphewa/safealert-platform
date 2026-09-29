import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { ResponseRequestModel } from '../models/responseRequest.model.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import { MongooseResponseRequestRepository } from '../repositories/mongooseResponseRequest.repository.js';

const requestId = '507f1f77bcf86cd799439011';
const residentId = '507f1f77bcf86cd799439012';
const assignedResponderId = '507f1f77bcf86cd799439013';
const otherResponderId = '507f1f77bcf86cd799439014';
const basePath = '/api/v1/response-requests';

function createBaseRequest(overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
  const base: SafeResponseRequest = {
    id: requestId,
    residentId,
    status: 'ASSIGNED',
    assignedResponderId,
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 2,
    injuredPeople: 1,
    medicalNeeds: true,
    vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'ACCESSIBLE',
    contact: { name: 'Resident A', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
    description: 'Resident requires medical attention.',
    declinedByResponderIds: [],
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides
  };
  if (overrides.status === 'NEW' && !('assignedResponderId' in overrides)) {
    delete base.assignedResponderId;
  }
  return base;
}

function setupContext(overrides: Partial<SafeResponseRequest> = {}) {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'field-update-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  const initial = createBaseRequest(overrides);
  repository.seedResponseRequest(initial);

  const token = (id = assignedResponderId, role: UserRole = 'EMERGENCY_RESPONDER') =>
    signAccessToken(config, { id, role });

  const app = createApp({
    config,
    authRepository: new InMemoryAuthRepository(),
    responseRequestRepository: repository
  });

  return { config, repository, initial, app, token };
}

afterEach(() => vi.restoreAllMocks());

describe('LDFEW-266 / LDFEW-350 / LDFEW-358: Responder Field Updates API', () => {
  it('allows the assigned responder to record operational field notes with server timestamp', async () => {
    const { app, token } = setupContext();
    const notes = 'Arrived at the entrance. Tree blocking main gate, using side entry.';

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: notes });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(requestId);
    expect(response.body.fieldNotes).toBe(notes);
    expect(response.body.fieldUpdatedAt).toBeDefined();
    expect(new Date(response.body.fieldUpdatedAt).getTime()).not.toBeNaN();
  });

  it('works via alternative alias route /responder/requests/:requestId/field-update', async () => {
    const { app, token } = setupContext();
    const notes = 'Patient is conscious, administered preliminary first aid.';

    const response = await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: notes });

    expect(response.status).toBe(200);
    expect(response.body.fieldNotes).toBe(notes);
  });

  it('allows field updates across active lifecycle stages: ASSIGNED, DISPATCHED, ARRIVED, IN_PROGRESS', async () => {
    for (const status of ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const) {
      const { app, token } = setupContext({ status });
      const notes = `Operational update during ${status} stage.`;

      const response = await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .auth(token(), { type: 'bearer' })
        .send({ fieldNotes: notes });

      expect(response.status).toBe(200);
      expect(response.body.fieldNotes).toBe(notes);
    }
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { app } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .send({ fieldNotes: 'Attempt without token' });

    expect(response.status).toBe(401);
  });

  it('rejects unauthorized roles (RESIDENT, DISASTER_OFFICER, VOLUNTEER) with 403', async () => {
    const { app, token } = setupContext();
    const roles: UserRole[] = ['RESIDENT', 'DISASTER_OFFICER', 'COMMUNITY_VOLUNTEER'];

    for (const role of roles) {
      const response = await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .auth(token('user-id', role), { type: 'bearer' })
        .send({ fieldNotes: 'Attempt by invalid role' });

      expect(response.status).toBe(403);
    }
  });

  it('rejects field updates from an unassigned responder with 403 REQUEST_NOT_ASSIGNED', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(otherResponderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })
      .send({ fieldNotes: 'Attempt by different responder' });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('REQUEST_NOT_ASSIGNED');
  });

  it('rejects field updates on NEW requests with 409 INVALID_REQUEST_STATUS', async () => {
    const { app, token } = setupContext({ status: 'NEW' });

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Cannot update unassigned' });

    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe('INVALID_REQUEST_STATUS');
  });

  it('rejects field updates on CANCELLED requests with 409 INVALID_REQUEST_STATUS', async () => {
    const { app, token } = setupContext({ status: 'CANCELLED' });

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Cannot update cancelled' });

    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe('INVALID_REQUEST_STATUS');
  });

  it('rejects field updates on COMPLETED requests with 409 INVALID_REQUEST_STATUS', async () => {
    const { app, token } = setupContext({ status: 'COMPLETED' });

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Cannot update completed' });

    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe('INVALID_REQUEST_STATUS');
  });

  it('rejects empty or whitespace-only fieldNotes with 400', async () => {
    const { app, token } = setupContext();

    for (const invalidValue of ['', '   ', '\n\t  ']) {
      const response = await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .auth(token(), { type: 'bearer' })
        .send({ fieldNotes: invalidValue });

      expect(response.status).toBe(400);
    }
  });

  it('rejects notes shorter than 3 characters or longer than 2000 characters with 400', async () => {
    const { app, token } = setupContext();

    const shortResponse = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'ab' });
    expect(shortResponse.status).toBe(400);

    const longResponse = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'a'.repeat(2001) });
    expect(longResponse.status).toBe(400);
  });

  it('rejects malformed request ID with 400', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/invalid-id-format/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Valid notes with bad id' });

    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent request ID', async () => {
    const { app, token } = setupContext();
    const nonExistentId = '507f1f77bcf86cd799439099';

    const response = await request(app)
      .patch(`${basePath}/${nonExistentId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Valid notes for missing request' });

    expect(response.status).toBe(404);
  });
});

describe('LDFEW-266 / LDFEW-356: Completion Details on COMPLETED transition', () => {
  it('requires assistanceProvided and completionSummary when completing a request', async () => {
    const { app, token } = setupContext({ status: 'IN_PROGRESS' });

    const missingBoth = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({ status: 'COMPLETED' });
    expect(missingBoth.status).toBe(400);
    expect(missingBoth.body.error?.code).toBe('COMPLETION_DETAILS_REQUIRED');

    const missingSummary = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({ status: 'COMPLETED', assistanceProvided: 'Bandaged wound' });
    expect(missingSummary.status).toBe(400);

    const whitespaceAssistance = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({ status: 'COMPLETED', assistanceProvided: '   ', completionSummary: 'Done' });
    expect(whitespaceAssistance.status).toBe(400);
  });

  it('successfully completes request with valid completion details and persists them', async () => {
    const { app, token } = setupContext({ status: 'IN_PROGRESS' });

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided first aid kit and oral rehydration salts.',
        completionSummary: 'Resident treated on scene and safely handed over to family.',
        responderRemarks: 'Follow-up check recommended within 24 hours.'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.completedAt).toBeDefined();
    expect(response.body.assistanceProvided).toBe('Provided first aid kit and oral rehydration salts.');
    expect(response.body.completionSummary).toBe('Resident treated on scene and safely handed over to family.');
    expect(response.body.responderRemarks).toBe('Follow-up check recommended within 24 hours.');
  });
});

describe('LDFEW-266: Mongoose ResponseRequestRepository field update & completion persistence', () => {
  it('calls findOneAndUpdate with fieldNotes, fieldUpdatedAt, and $currentDate', async () => {
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(new ResponseRequestModel({
      residentId,
      status: 'IN_PROGRESS',
      assignedResponderId,
      assistanceType: 'MEDICAL_ASSISTANCE',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      affectedPeople: 1,
      injuredPeople: 0,
      medicalNeeds: false,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
      roadAccessibility: 'CLEAR',
      contact: { name: 'Resident', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
      description: 'Need help',
      fieldNotes: 'Field update via mongo',
      fieldUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    const updateSpy = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);

    const repo = new MongooseResponseRequestRepository();
    const result = await repo.updateResponseRequestFieldUpdate(requestId, assignedResponderId, 'Field update via mongo');

    expect(updateSpy).toHaveBeenCalledWith(
      {
        _id: requestId,
        assignedResponderId,
        status: { $in: ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] }
      },
      {
        $set: {
          fieldNotes: 'Field update via mongo',
          fieldUpdatedAt: expect.any(Date)
        }
      },
      { new: true, runValidators: true }
    );
    expect(result).toBeDefined();
    expect(result?.fieldNotes).toBe('Field update via mongo');
  });
});
