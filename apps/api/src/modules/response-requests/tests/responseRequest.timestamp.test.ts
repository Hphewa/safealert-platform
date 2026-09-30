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

function createAssignedRequest(overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
  return {
    id: requestId,
    residentId,
    status: 'IN_PROGRESS',
    assignedResponderId,
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 2,
    injuredPeople: 1,
    medicalNeeds: true,
    vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'ACCESSIBLE',
    contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
    description: 'Resident requires medical triage.',
    acceptedAt: '2026-09-24T10:00:00.000Z',
    dispatchedAt: '2026-09-24T10:05:00.000Z',
    arrivedAt: '2026-09-24T10:15:00.000Z',
    inProgressAt: '2026-09-24T10:20:00.000Z',
    declinedByResponderIds: [],
    createdAt: '2026-09-24T09:55:00.000Z',
    updatedAt: '2026-09-24T10:20:00.000Z',
    ...overrides
  };
}

function setupContext(overrides: Partial<SafeResponseRequest> = {}) {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'timestamp-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  const initial = createAssignedRequest(overrides);
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LDFEW-354: Server Timestamp Generation for Responder Field Updates', () => {
  it('generates the authoritative fieldUpdatedAt timestamp on the server', async () => {
    const fixedTime = new Date('2026-09-24T10:25:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);

    const { app, token } = setupContext();
    const notes = 'Patient is conscious and stabilized with oxygen mask.';

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: notes });

    expect(response.status).toBe(200);
    expect(response.body.fieldNotes).toBe(notes);
    expect(response.body.fieldUpdatedAt).toBe(fixedTime.toISOString());
  });

  it('persists fieldUpdatedAt in storage and preserves it across reloads', async () => {
    const serverTime = new Date('2026-09-24T10:26:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(serverTime);

    const { app, token, repository } = setupContext();
    const notes = 'Administered emergency medication on site.';

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: notes });

    expect(response.status).toBe(200);
    const persistedTimestamp = response.body.fieldUpdatedAt;

    // Advance time by 30 minutes to ensure reload does NOT regenerate the timestamp
    vi.setSystemTime(new Date('2026-09-24T10:56:00.000Z'));

    const reloaded = await repository.findResponseRequestForProgress(requestId);
    expect(reloaded?.fieldNotes).toBe(notes);
    expect(reloaded?.fieldUpdatedAt).toBe(persistedTimestamp);
    expect(reloaded?.fieldUpdatedAt).toBe(serverTime.toISOString());
  });

  it('updates fieldUpdatedAt to new server time on subsequent updates while preserving lifecycle timestamps', async () => {
    const firstTime = new Date('2026-09-24T10:25:00.000Z');
    const secondTime = new Date('2026-09-24T10:45:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(firstTime);

    const { app, token, initial, repository } = setupContext();

    // First update
    const firstResponse = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'First update at entrance.' });
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.fieldUpdatedAt).toBe(firstTime.toISOString());

    // Advance server clock
    vi.setSystemTime(secondTime);

    // Second update
    const secondResponse = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: 'Second update: patient moved to stretcher.' });
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.fieldUpdatedAt).toBe(secondTime.toISOString());
    expect(secondResponse.body.fieldNotes).toBe('Second update: patient moved to stretcher.');

    // Verify all prior lifecycle timestamps remain immutable
    expect(secondResponse.body.createdAt).toBe(initial.createdAt);
    expect(secondResponse.body.acceptedAt).toBe(initial.acceptedAt);
    expect(secondResponse.body.dispatchedAt).toBe(initial.dispatchedAt);
    expect(secondResponse.body.arrivedAt).toBe(initial.arrivedAt);
    expect(secondResponse.body.inProgressAt).toBe(initial.inProgressAt);

    // Verify persistence in repository
    const stored = await repository.findResponseRequestForProgress(requestId);
    expect(stored?.fieldUpdatedAt).toBe(secondTime.toISOString());
  });

  it('strictly rejects client-supplied fieldUpdatedAt or timestamp in request body', async () => {
    const { app, token } = setupContext();

    const clientAttempt = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({
        fieldNotes: 'Valid notes text',
        fieldUpdatedAt: '2020-01-01T00:00:00.000Z'
      });

    expect(clientAttempt.status).toBe(400);
    expect(clientAttempt.body.error?.code).toBe('VALIDATION_ERROR');

    const timestampAttempt = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({
        fieldNotes: 'Valid notes text',
        timestamp: '2020-01-01T00:00:00.000Z'
      });

    expect(timestampAttempt.status).toBe(400);
    expect(timestampAttempt.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('does not create or alter fieldUpdatedAt when field notes validation fails', async () => {
    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(), { type: 'bearer' })
      .send({ fieldNotes: '   ' });

    expect(response.status).toBe(400);

    const record = await repository.findResponseRequestForProgress(requestId);
    expect(record?.fieldUpdatedAt).toBeUndefined();
    expect(record?.fieldNotes).toBeUndefined();
  });

  it('rejects field update and timestamp generation from an unassigned responder with 403', async () => {
    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(token(otherResponderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })
      .send({ fieldNotes: 'Attempt by different responder' });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('REQUEST_NOT_ASSIGNED');

    const record = await repository.findResponseRequestForProgress(requestId);
    expect(record?.fieldUpdatedAt).toBeUndefined();
  });
});

describe('LDFEW-354: Server Timestamp Generation for Request Completion (completedAt)', () => {
  it('generates authoritative completedAt server timestamp when transitioning to COMPLETED', async () => {
    const completionTime = new Date('2026-09-24T11:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(completionTime);

    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Evacuated resident to community hospital.',
        completionSummary: 'Resident safe; medical staff took over care.'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.completedAt).toBe(completionTime.toISOString());
    expect(response.body.assistanceProvided).toBe('Evacuated resident to community hospital.');
    expect(response.body.completionSummary).toBe('Resident safe; medical staff took over care.');

    // Verify atomic persistence in repository
    const persisted = await repository.findResponseRequestForProgress(requestId);
    expect(persisted?.status).toBe('COMPLETED');
    expect(persisted?.completedAt).toBe(completionTime.toISOString());
    expect(persisted?.assistanceProvided).toBe('Evacuated resident to community hospital.');
  });

  it('preserves completedAt across reloads without regenerating a new timestamp', async () => {
    const completionTime = new Date('2026-09-24T11:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(completionTime);

    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided first aid and warm shelter.',
        completionSummary: 'Resident in stable condition.'
      });

    expect(response.status).toBe(200);

    // Fast-forward server clock by 2 hours
    vi.setSystemTime(new Date('2026-09-24T13:00:00.000Z'));

    const reloaded = await repository.findResponseRequestForProgress(requestId);
    expect(reloaded?.completedAt).toBe(completionTime.toISOString());
  });

  it('strictly rejects client-supplied completedAt in progress request body', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance delivered',
        completionSummary: 'Valid completion outcome',
        completedAt: '2020-01-01T00:00:00.000Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('does not generate completedAt or persist completion data when validation fails', async () => {
    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance delivered',
        completionSummary: '   ' // whitespace only, invalid
      });

    expect(response.status).toBe(400);

    const record = await repository.findResponseRequestForProgress(requestId);
    expect(record?.status).toBe('IN_PROGRESS');
    expect(record?.completedAt).toBeUndefined();
    expect(record?.assistanceProvided).toBeUndefined();
  });

  it('does not generate completedAt when lifecycle transition is invalid', async () => {
    const { app, token, repository } = setupContext({ status: 'ASSIGNED' });

    const response = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance',
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe('INVALID_PROGRESS_TRANSITION');

    const record = await repository.findResponseRequestForProgress(requestId);
    expect(record?.status).toBe('ASSIGNED');
    expect(record?.completedAt).toBeUndefined();
  });
});

describe('LDFEW-354: Mongoose Atomic Persistence for Server Timestamps', () => {
  it('calls Mongoose findOneAndUpdate with server Date for fieldUpdatedAt and runValidators', async () => {
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
      roadAccessibility: 'ACCESSIBLE',
      contact: { name: 'Resident', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
      description: 'Need help',
      fieldNotes: 'MongoDB timestamp verification',
      fieldUpdatedAt: new Date('2026-09-24T10:30:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    const updateSpy = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);

    const repo = new MongooseResponseRequestRepository();
    const result = await repo.updateResponseRequestFieldUpdate(
      requestId,
      assignedResponderId,
      'MongoDB timestamp verification'
    );

    expect(updateSpy).toHaveBeenCalledWith(
      {
        _id: requestId,
        assignedResponderId,
        status: { $in: ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] }
      },
      {
        $set: {
          fieldNotes: 'MongoDB timestamp verification',
          fieldUpdatedAt: expect.any(Date)
        }
      },
      { new: true, runValidators: true }
    );
    expect(result?.fieldUpdatedAt).toBeDefined();
  });

  it('calls Mongoose findOneAndUpdate with server Date for completedAt and runValidators', async () => {
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(new ResponseRequestModel({
      residentId,
      status: 'COMPLETED',
      assignedResponderId,
      assistanceType: 'MEDICAL_ASSISTANCE',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      affectedPeople: 1,
      injuredPeople: 0,
      medicalNeeds: false,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
      roadAccessibility: 'ACCESSIBLE',
      contact: { name: 'Resident', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
      description: 'Need help',
      assistanceProvided: 'First aid rendered',
      completionSummary: 'Resident stable',
      completedAt: new Date('2026-09-24T11:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    const updateSpy = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);

    const repo = new MongooseResponseRequestRepository();
    const result = await repo.updateResponseRequestProgress(
      requestId,
      assignedResponderId,
      'IN_PROGRESS',
      'COMPLETED',
      {
        assistanceProvided: 'First aid rendered',
        completionSummary: 'Resident stable'
      }
    );

    expect(updateSpy).toHaveBeenCalledWith(
      {
        _id: requestId,
        assignedResponderId,
        status: 'IN_PROGRESS'
      },
      {
        $set: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          assistanceProvided: 'First aid rendered',
          completionSummary: 'Resident stable'
        }
      },
      { new: true, runValidators: true }
    );
    expect(result?.completedAt).toBeDefined();
  });
});
