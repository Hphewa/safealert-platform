import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { InMemoryReportRepository } from '../../reports/repositories/inMemoryReport.repository.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import { MongooseResponseRequestRepository } from '../repositories/mongooseResponseRequest.repository.js';
import { ResponseRequestModel, toSafeResponseRequest } from '../models/responseRequest.model.js';
import { ResponseRequestService } from '../services/responseRequest.service.js';
import { RESPONSE_STATUSES, type SafeResponseRequest } from '@safealert/contracts';

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

describe('response request progress API', () => {
  const requestId = '507f1f77bcf86cd799439011';
  const progressPath = `/api/v1/response-requests/${requestId}/progress`;

  async function createProgressContext(overrides: Partial<SafeResponseRequest> = {}) {
    const context = createTestContext();
    const token = await createAccessToken(
      context.authRepository,
      'EMERGENCY_RESPONDER',
      'progress-responder@example.com'
    );
    const responderId = (jwt.decode(token) as jwt.JwtPayload).sub!;
    const storedRequest = createStoredResponseRequest({
      id: requestId,
      status: 'ASSIGNED',
      assignedResponderId: responderId,
      ...overrides
    });
    context.responseRequestRepository.seedResponseRequest(storedRequest);
    return { ...context, token, responderId, storedRequest };
  }

  it('allows the assigned responder to dispatch and persists only the progress change', async () => {
    const { app, token, responseRequestRepository, storedRequest } = await createProgressContext();
    const response = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISPATCHED' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...storedRequest,
      status: 'DISPATCHED',
      dispatchedAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(response.body);
  });

  it('keeps progress in the authenticated Assigned queue until completion without changing Pending', async () => {
    const { app, token, responderId, responseRequestRepository, storedRequest } = await createProgressContext();
    const pending = createStoredResponseRequest({ id: 'pending-request' });
    responseRequestRepository.seedResponseRequest(pending);
    for (const status of ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const) {
      responseRequestRepository.seedResponseRequest(createStoredResponseRequest({
        id: `other-${status}`, status, assignedResponderId: 'another-responder'
      }));
    }

    let confirmed = storedRequest;
    for (const status of ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const) {
      if (status !== 'ASSIGNED') {
        const progressPayload = status === 'COMPLETED'
          ? { status, assistanceProvided: 'Provided first aid and evacuation', completionSummary: 'Resident safely transported' }
          : { status };
        const updated = await request(app).patch(progressPath)
          .set('Authorization', `Bearer ${token}`).send(progressPayload);
        expect(updated.status).toBe(200);
        confirmed = updated.body;
      }
      const assigned = await request(app).get('/api/v1/response-requests/responder/assigned')
        .query({ responderId: 'another-responder' })
        .set('Authorization', `Bearer ${token}`);
      expect(assigned.status).toBe(200);
      expect(assigned.body).toEqual(status === 'COMPLETED' ? [] : [confirmed]);
      expect(confirmed).toMatchObject({ id: requestId, status, assignedResponderId: responderId });

      const pendingQueue = await request(app).get('/api/v1/response-requests/responder/pending')
        .set('Authorization', `Bearer ${token}`);
      expect(pendingQueue.status).toBe(200);
      expect(pendingQueue.body).toEqual([pending]);
    }
  });

  it('completes NEW through LDFEW-130 acceptance and every progress stage, preserving timestamps across queue reloads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const startedAt = Date.parse('2026-09-24T10:00:00.000Z');
    vi.setSystemTime(startedAt);
    try {
      const { app, token, responderId, responseRequestRepository, storedRequest } = await createProgressContext({
        status: 'NEW'
      });
      delete storedRequest.assignedResponderId;
      responseRequestRepository.seedResponseRequest(storedRequest);
      const initialPending = await request(app).get('/api/v1/response-requests/responder/pending')
        .set('Authorization', `Bearer ${token}`);
      expect(initialPending.status).toBe(200);
      expect(initialPending.body).toEqual([storedRequest]);

      const accepted = await request(app)
        .patch(`/api/v1/response-requests/responder/requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${token}`);
      let expected: SafeResponseRequest = {
        ...storedRequest, status: 'ASSIGNED', assignedResponderId: responderId,
        acceptedAt: new Date(startedAt).toISOString(), updatedAt: new Date(startedAt).toISOString()
      };
      expect(accepted.status).toBe(200);
      expect(accepted.body).toEqual(expected);
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(expected);
      const assigned = await request(app).get('/api/v1/response-requests/responder/assigned')
        .set('Authorization', `Bearer ${token}`);
      expect(assigned.status).toBe(200);
      expect(assigned.body).toEqual([expected]);

      const stages = [
        ['DISPATCHED', 'dispatchedAt'],
        ['ARRIVED', 'arrivedAt'],
        ['IN_PROGRESS', 'inProgressAt'],
        ['COMPLETED', 'completedAt']
      ] as const;

      for (const [index, [status, timestampField]] of stages.entries()) {
        const occurredAt = new Date(startedAt + (index + 1) * 60_000);
        vi.setSystemTime(occurredAt);
        const completionPayload = status === 'COMPLETED'
          ? { assistanceProvided: 'First aid and food delivered', completionSummary: 'Resident stabilized' }
          : {};
        const response = await request(app)
          .patch(progressPath)
          .set('Authorization', `Bearer ${token}`)
          .send({ status, ...completionPayload });

        expected = {
          ...expected,
          status,
          [timestampField]: occurredAt.toISOString(),
          updatedAt: occurredAt.toISOString(),
          ...(status === 'COMPLETED' ? completionPayload : {})
        };
        expect(response.status).toBe(200);
        expect(response.body).toEqual(expected);
        expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(expected);

        const reloaded = await request(app).get('/api/v1/response-requests/responder/assigned')
          .set('Authorization', `Bearer ${token}`);
        expect(reloaded.status).toBe(200);
        expect(reloaded.body).toEqual(status === 'COMPLETED' ? [] : [expected]);
        const pending = await request(app).get('/api/v1/response-requests/responder/pending')
          .set('Authorization', `Bearer ${token}`);
        expect(pending.status).toBe(200);
        expect(pending.body).toEqual([]);

        vi.setSystemTime(new Date(occurredAt.getTime() + 30_000));
        const duplicate = await request(app)
          .patch(progressPath)
          .set('Authorization', `Bearer ${token}`)
          .send({ status });

        expect(duplicate.status).toBe(409);
        expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(expected);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { body: { status: 'COMPLETED' }, otherResponder: false, expectedStatus: 409 },
    { body: { status: 'ASSIGNED' }, otherResponder: false, expectedStatus: 409 },
    { body: { status: 'DISPATCHED' }, otherResponder: false, expectedStatus: 409 },
    { body: { status: 'INVALID' }, otherResponder: false, expectedStatus: 400 },
    { body: { status: 'ARRIVED', arrivedAt: '2020-01-01T00:00:00.000Z' }, otherResponder: false, expectedStatus: 400 },
    { body: { status: 'ARRIVED' }, otherResponder: true, expectedStatus: 403 }
  ])('preserves existing lifecycle data when a progress update is rejected: %j', async ({ body, otherResponder, expectedStatus }) => {
    const { app, token, authRepository, responseRequestRepository, storedRequest } = await createProgressContext({
      status: 'DISPATCHED',
      acceptedAt: '2026-09-23T10:01:00.000Z',
      dispatchedAt: '2026-09-23T10:02:00.000Z'
    });
    const actorToken = otherResponder
      ? await createAccessToken(authRepository, 'EMERGENCY_RESPONDER', 'unauthorized-progress@example.com')
      : token;
    const response = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${actorToken}`)
      .send(body);

    expect(response.status).toBe(expectedStatus);
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
  });

  it('allows only the responder who accepted through LDFEW-130 to start progress', async () => {
    const { app, token, authRepository, responderId, responseRequestRepository, storedRequest } =
      await createProgressContext({ status: 'NEW' });
    delete storedRequest.assignedResponderId;
    responseRequestRepository.seedResponseRequest(storedRequest);
    const otherToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'other-progress-responder@example.com'
    );

    const accepted = await request(app)
      .patch(`/api/v1/response-requests/responder/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${token}`);

    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('ASSIGNED');
    expect(accepted.body.assignedResponderId).toBe(responderId);

    const rejected = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'DISPATCHED' });

    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('REQUEST_NOT_ASSIGNED');
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(accepted.body);

    const dispatched = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISPATCHED' });

    expect(dispatched.status).toBe(200);
    expect(dispatched.body).toEqual({
      ...accepted.body,
      status: 'DISPATCHED',
      dispatchedAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });

  it.each([null, undefined])('requires an actor in the service when actor is %s', async (actor) => {
    const { responseRequestRepository, storedRequest } = await createProgressContext();
    const service = new ResponseRequestService(responseRequestRepository);

    await expect(service.updateResponseRequestProgress(requestId, actor, 'DISPATCHED'))
      .rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
  });

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'DISASTER_OFFICER'] as const)(
    'enforces the responder role in the service even when the %s actor ID matches the assignment',
    async (role) => {
      const { responseRequestRepository, responderId, storedRequest } = await createProgressContext();
      const service = new ResponseRequestService(responseRequestRepository);

      await expect(service.updateResponseRequestProgress(
        requestId,
        { id: responderId, role },
        'DISPATCHED'
      )).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
    }
  );

  it('enforces assignment in the service without relying on route middleware', async () => {
    const { responseRequestRepository, storedRequest } = await createProgressContext();
    const service = new ResponseRequestService(responseRequestRepository);

    await expect(service.updateResponseRequestProgress(
      requestId,
      { id: 'another-responder', role: 'EMERGENCY_RESPONDER' },
      'DISPATCHED'
    )).rejects.toMatchObject({ statusCode: 403, code: 'REQUEST_NOT_ASSIGNED' });
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
  });

  it.each(['another-responder', undefined])(
    'rejects a responder when assignment is %s',
    async (assignedResponderId) => {
      const { app, token, responseRequestRepository, storedRequest } = await createProgressContext();
      if (assignedResponderId === undefined) {
        delete storedRequest.assignedResponderId;
      } else {
        storedRequest.assignedResponderId = assignedResponderId;
      }
      responseRequestRepository.seedResponseRequest(storedRequest);
      const response = await request(app)
        .patch(progressPath)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DISPATCHED' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('REQUEST_NOT_ASSIGNED');
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
    }
  );

  it.each(['RESIDENT', 'COMMUNITY_VOLUNTEER', 'DISASTER_OFFICER'] as const)(
    'rejects the %s role',
    async (role) => {
      const { app, authRepository, responseRequestRepository, storedRequest } = await createProgressContext();
      const token = await createAccessToken(authRepository, role, `${role}@example.com`);
      const response = await request(app)
        .patch(progressPath)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DISPATCHED' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
    }
  );

  it('requires authentication and rejects an invalid token', async () => {
    const { app } = createTestContext();
    const missing = await request(app).patch(progressPath).send({ status: 'DISPATCHED' });
    const invalid = await request(app)
      .patch(progressPath)
      .set('Authorization', 'Bearer invalid-token')
      .send({ status: 'DISPATCHED' });

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
  });

  it.each([
    {},
    { status: 'INVALID' },
    { status: 'NEW' },
    { status: 'dispatched' },
    { status: null },
    { status: 1 },
    { status: ['DISPATCHED'] },
    { status: 'DISPATCHED', assignedResponderId: 'spoofed-responder' },
    { status: 'DISPATCHED', dispatchedAt: '2026-09-24T10:00:00.000Z' }
  ])('rejects an invalid progress body: %j', async (body) => {
    const { app, token, responseRequestRepository, storedRequest } = await createProgressContext();
    const response = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toEqual(expect.any(String));
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
  });

  it.each([
    ['NEW', 'ASSIGNED'],
    ['NEW', 'DISPATCHED'],
    ['NEW', 'ARRIVED'],
    ['NEW', 'IN_PROGRESS'],
    ['NEW', 'COMPLETED'],
    ['ASSIGNED', 'ASSIGNED'],
    ['ASSIGNED', 'ARRIVED'],
    ['ASSIGNED', 'IN_PROGRESS'],
    ['ASSIGNED', 'COMPLETED'],
    ['DISPATCHED', 'ASSIGNED'],
    ['DISPATCHED', 'IN_PROGRESS'],
    ['DISPATCHED', 'COMPLETED'],
    ['ARRIVED', 'ASSIGNED'],
    ['ARRIVED', 'DISPATCHED'],
    ['ARRIVED', 'ARRIVED'],
    ['ARRIVED', 'COMPLETED'],
    ['DISPATCHED', 'DISPATCHED'],
    ['IN_PROGRESS', 'ASSIGNED'],
    ['IN_PROGRESS', 'DISPATCHED'],
    ['IN_PROGRESS', 'ARRIVED'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['COMPLETED', 'ASSIGNED'],
    ['COMPLETED', 'DISPATCHED'],
    ['COMPLETED', 'ARRIVED'],
    ['COMPLETED', 'IN_PROGRESS'],
    ['COMPLETED', 'COMPLETED']
  ] as const)('rejects the transition %s -> %s without changing the request', async (status, nextStatus) => {
    const { app, token, responseRequestRepository, storedRequest } = await createProgressContext({ status });
    const response = await request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: nextStatus });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_PROGRESS_TRANSITION');
    expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);
  });

  it.each(['invalid-id', '507f1f77bcf86cd79943901', 'z'.repeat(24), '%20'])(
    'rejects the malformed request ID %s',
    async (invalidId) => {
      const { app, token } = await createProgressContext();
      const response = await request(app)
        .patch(`/api/v1/response-requests/${invalidId}/progress`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DISPATCHED' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST_ID');
    }
  );

  it('returns not found for a valid ID with no matching request', async () => {
    const { app, token } = await createProgressContext();
    const response = await request(app)
      .patch('/api/v1/response-requests/507f1f77bcf86cd799439012/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISPATCHED' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('REQUEST_NOT_FOUND');
  });

  it('handles a missing path ID through the existing route-not-found response', async () => {
    const { app, token } = await createProgressContext();
    for (const path of ['/api/v1/response-requests/progress', '/api/v1/response-requests//progress']) {
      const response = await request(app)
        .patch(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DISPATCHED' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects an empty ID in the service before repository access', async () => {
    const { responseRequestRepository, responderId } = await createProgressContext();
    const service = new ResponseRequestService(responseRequestRepository);

    await expect(service.updateResponseRequestProgress(
      '',
      { id: responderId, role: 'EMERGENCY_RESPONDER' },
      'DISPATCHED'
    )).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST_ID' });
  });

  it('allows only one of two concurrent dispatch updates to succeed', async () => {
    const { app, token, responseRequestRepository } = await createProgressContext();
    const responses = await Promise.all([0, 1].map(() => request(app)
      .patch(progressPath)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISPATCHED' })));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await responseRequestRepository.findResponseRequestForProgress(requestId))?.status).toBe('DISPATCHED');
  });

  it.each(['findResponseRequestForProgress', 'updateResponseRequestProgress'] as const)(
    'returns a sanitized error after %s fails, preserves state, and permits a later retry', async (operation) => {
      const { app, token, responseRequestRepository, storedRequest } = await createProgressContext();
      const failure = new Error('Private database connection details');
      const repositorySpy = vi.spyOn(responseRequestRepository, operation).mockRejectedValueOnce(failure);
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const failed = await request(app).patch(progressPath)
          .set('Authorization', `Bearer ${token}`).send({ status: 'DISPATCHED' });
        expect(failed.status).toBe(500);
        expect(failed.body).toEqual({
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' }
        });
        expect(logSpy).toHaveBeenCalled();
        expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(storedRequest);

        const retried = await request(app).patch(progressPath)
          .set('Authorization', `Bearer ${token}`).send({ status: 'DISPATCHED' });
        expect(retried.status).toBe(200);
        expect(retried.body.status).toBe('DISPATCHED');
        expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(retried.body);
      } finally {
        repositorySpy.mockRestore();
        logSpy.mockRestore();
      }
    }
  );

  it('does not repeat a committed transition when the first response fails and the responder retries', async () => {
    const { app, token, responseRequestRepository } = await createProgressContext();
    const update = responseRequestRepository.updateResponseRequestProgress.bind(responseRequestRepository);
    const updateSpy = vi.spyOn(responseRequestRepository, 'updateResponseRequestProgress')
      .mockImplementationOnce(async (...args) => {
        await update(...args);
        // A response failure does not establish that the database write failed.
        throw new Error('Response interrupted after persistence');
      });
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failed = await request(app).patch(progressPath)
        .set('Authorization', `Bearer ${token}`).send({ status: 'DISPATCHED' });
      expect(failed.status).toBe(500);
      const saved = await responseRequestRepository.findResponseRequestForProgress(requestId);
      expect(saved).toMatchObject({ status: 'DISPATCHED', dispatchedAt: expect.any(String) });
      const retried = await request(app).patch(progressPath)
        .set('Authorization', `Bearer ${token}`).send({ status: 'DISPATCHED' });
      expect(retried.status).toBe(409);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(saved);
      const reloaded = await request(app).get('/api/v1/response-requests/responder/assigned')
        .set('Authorization', `Bearer ${token}`);
      expect(reloaded.status).toBe(200);
      expect(reloaded.body).toEqual([saved]);
    } finally {
      updateSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it.each([
    { status: 'ARRIVED' as const },
    { assignedResponderId: 'another-responder' }
  ])('rejects a stale write after a concurrent change: %j', async (change) => {
    const { app, token, responseRequestRepository, storedRequest } = await createProgressContext();
    const update = responseRequestRepository.updateResponseRequestProgress.bind(responseRequestRepository);
    const changedRequest = { ...storedRequest, ...change };
    const updateSpy = vi.spyOn(responseRequestRepository, 'updateResponseRequestProgress')
      .mockImplementationOnce(async (...args) => {
        responseRequestRepository.seedResponseRequest(changedRequest);
        return update(...args);
      });

    try {
      const response = await request(app)
        .patch(progressPath)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'DISPATCHED' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('REQUEST_PROGRESS_CONFLICT');
      expect(await responseRequestRepository.findResponseRequestForProgress(requestId)).toEqual(changedRequest);
    } finally {
      updateSpy.mockRestore();
    }
  });
});

describe('active responder queues after cancellation (LDFEW-324)', () => {
  it('queries persisted NEW status and responder-specific declines in MongoDB', async () => {
    const responderId = '507f1f77bcf86cd799439013';
    const query = ResponseRequestModel.find();
    vi.spyOn(query, 'exec').mockResolvedValue([]);
    const findSpy = vi.spyOn(ResponseRequestModel, 'find').mockReturnValueOnce(query);
    try {
      await expect(new MongooseResponseRequestRepository().findPendingResponseRequests(responderId))
        .resolves.toEqual([]);
      expect(findSpy).toHaveBeenCalledExactlyOnceWith({
        status: 'NEW', declinedByResponderIds: { $nin: [responderId] }
      });
      expect(query.getOptions().sort).toEqual({ createdAt: -1 });
    } finally {
      findSpy.mockRestore();
    }
  });

  it('returns only eligible NEW and own active assignments from mixed persisted statuses', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const email = 'queue-responder@example.com';
    const token = await createAccessToken(authRepository, 'EMERGENCY_RESPONDER', email);
    const responder = (await authRepository.findUserByEmailWithPassword(email))!;
    // Include legacy/unsupported data to prove the queue fails closed for unknown statuses.
    const statuses = [...RESPONSE_STATUSES, 'UNKNOWN' as SafeResponseRequest['status']];
    for (const status of statuses) {
      responseRequestRepository.seedResponseRequest(createStoredResponseRequest({
        id: status, status, assignedResponderId: responder.id
      }));
    }
    for (const status of ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const) {
      responseRequestRepository.seedResponseRequest(createStoredResponseRequest({
        id: `other-${status}`, status, assignedResponderId: 'another-responder'
      }));
    }
    responseRequestRepository.seedResponseRequest(createStoredResponseRequest({
      id: 'declined-by-self', declinedByResponderIds: [responder.id]
    }));
    responseRequestRepository.seedResponseRequest(createStoredResponseRequest({
      id: 'declined-by-other', declinedByResponderIds: ['another-responder'],
      createdAt: '2026-09-23T11:00:00.000Z'
    }));

    const pending = await request(app).get('/api/v1/response-requests/responder/pending')
      .auth(token, { type: 'bearer' });
    const assigned = await request(app).get('/api/v1/response-requests/responder/assigned')
      .auth(token, { type: 'bearer' });

    expect(pending.status).toBe(200);
    expect(assigned.status).toBe(200);
    expect(pending.body.map(({ id }: SafeResponseRequest) => id)).toEqual(['declined-by-other', 'NEW']);
    expect(assigned.body.map(({ id }: SafeResponseRequest) => id))
      .toEqual(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS']);
    for (const status of ['CANCELLED', 'COMPLETED'] as const) {
      await expect(responseRequestRepository.findResponseRequestById(status, 'resident-1'))
        .resolves.toEqual(createStoredResponseRequest({ id: status, status, assignedResponderId: responder.id }));
    }
  });

  it('removes a newly cancelled request on the next queue fetch while preserving Resident tracking', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderToken = await createAccessToken(authRepository, 'EMERGENCY_RESPONDER', 'refresh-responder@example.com');
    const residentToken = await createAccessToken(authRepository, 'RESIDENT', 'refresh-resident@example.com');
    const resident = (await authRepository.findUserByEmailWithPassword('refresh-resident@example.com'))!;
    const original = createStoredResponseRequest({ id: '507f1f77bcf86cd799439011', residentId: resident.id });
    responseRequestRepository.seedResponseRequest(original);

    const before = await request(app).get('/api/v1/response-requests/responder/pending')
      .auth(responderToken, { type: 'bearer' });
    expect(before.status).toBe(200);
    expect(before.body).toEqual([original]);

    const cancelled = await request(app).patch(`/api/v1/response-requests/${original.id}/cancel`)
      .auth(residentToken, { type: 'bearer' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.responseRequest).toEqual({
      ...original, status: 'CANCELLED', cancelledAt: expect.any(String), updatedAt: expect.any(String)
    });
    for (const queue of ['pending', 'assigned']) {
      const refreshed = await request(app).get(`/api/v1/response-requests/responder/${queue}`)
        .auth(responderToken, { type: 'bearer' });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body).toEqual([]);
    }
    const tracked = await request(app).get(`/api/v1/response-requests/mine/${original.id}`)
      .auth(residentToken, { type: 'bearer' });
    expect(tracked.status).toBe(200);
    expect(tracked.body.responseRequest).toEqual(cancelled.body.responseRequest);
    await expect(responseRequestRepository.findResponseRequestById(original.id, resident.id))
      .resolves.toEqual(cancelled.body.responseRequest);
  });
});

describe('response request progress MongoDB persistence', () => {
  const acceptedAt = new Date('2026-09-23T10:01:00.000Z');
  const occurredAt = new Date('2026-09-23T10:02:00.000Z');

  function createDocument() {
    return new ResponseRequestModel({
      ...createStoredResponseRequest(),
      _id: '507f1f77bcf86cd799439011',
      residentId: '507f1f77bcf86cd799439012',
      assignedResponderId: '507f1f77bcf86cd799439013',
      status: 'ASSIGNED',
      acceptedAt
    });
  }

  it('does not default timestamps for stages that have not occurred', async () => {
    const document = createDocument();
    await expect(document.validate()).resolves.toBeUndefined();
    const result = toSafeResponseRequest(document);

    expect(result.acceptedAt).toBe(acceptedAt.toISOString());
    for (const field of ['dispatchedAt', 'arrivedAt', 'inProgressAt', 'completedAt'] as const) {
      expect(document[field]).toBeUndefined();
      expect(result).not.toHaveProperty(field);
    }
  });

  it('queries all active assigned statuses while preserving the responder ownership predicate', async () => {
    const document = createDocument();
    document.status = 'DISPATCHED';
    const query = ResponseRequestModel.find();
    vi.spyOn(query, 'exec').mockResolvedValue([document]);
    const findSpy = vi.spyOn(ResponseRequestModel, 'find').mockReturnValueOnce(query);
    try {
      const responderId = document.assignedResponderId!.toString();
      const result = await new MongooseResponseRequestRepository().findAssignedResponseRequests(responderId);
      expect(findSpy).toHaveBeenCalledExactlyOnceWith({
        assignedResponderId: responderId,
        status: { $in: ['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] }
      });
      expect(query.getOptions().sort).toEqual({ createdAt: -1 });
      expect(result).toEqual([toSafeResponseRequest(document)]);
    } finally {
      findSpy.mockRestore();
    }
  });

  it.each([
    ['ASSIGNED', 'DISPATCHED', 'dispatchedAt'],
    ['DISPATCHED', 'ARRIVED', 'arrivedAt'],
    ['ARRIVED', 'IN_PROGRESS', 'inProgressAt'],
    ['IN_PROGRESS', 'COMPLETED', 'completedAt']
  ] as const)('writes %s -> %s and %s in one conditional MongoDB update', async (currentStatus, nextStatus, timestampField) => {
    const document = createDocument();
    document.status = nextStatus;
    document[timestampField] = occurredAt;
    await expect(document.validate()).resolves.toBeUndefined();
    expect(document[timestampField]).toBeInstanceOf(Date);

    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(document);
    const updateSpy = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);

    try {
      const result = await new MongooseResponseRequestRepository().updateResponseRequestProgress(
        document._id.toString(),
        document.assignedResponderId!.toString(),
        currentStatus,
        nextStatus
      );

      expect(updateSpy).toHaveBeenCalledExactlyOnceWith(
        {
          _id: document._id.toString(),
          assignedResponderId: document.assignedResponderId!.toString(),
          status: currentStatus
        },
        { $set: { status: nextStatus, [timestampField]: expect.any(Date) } },
        { new: true, runValidators: true }
      );
      expect(result?.status).toBe(nextStatus);
      expect(result?.[timestampField]).toBe(occurredAt.toISOString());
      expect(result?.acceptedAt).toBe(acceptedAt.toISOString());
    } finally {
      updateSpy.mockRestore();
    }
  });
});

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

  it('returns pending NEW requests newest first through the API', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'responder-order@example.com'
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({
        id: 'older-pending-request',
        createdAt: '2026-09-23T09:00:00.000Z'
      })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({
        id: 'newer-pending-request',
        createdAt: '2026-09-23T12:00:00.000Z'
      })
    );

    const response = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'newer-pending-request',
      'older-pending-request'
    ]);
  });

  it('excludes only the authenticated responder\'s declined requests from Pending', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderA = await authRepository.createUser({
      name: 'Responder A User',
      email: 'pending-filter-a@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    const responderAToken = jwt.sign({ role: responderA.role }, 'test-access-secret', {
      subject: responderA.id,
      expiresIn: '15m'
    });
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({
        id: 'declined-by-a',
        declinedByResponderIds: [responderA.id]
      })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'available-to-a' })
    );

    const responderAResponse = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderAToken}`);

    expect(responderAResponse.status).toBe(200);
    expect(responderAResponse.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'available-to-a'
    ]);

    const responderB = await authRepository.createUser({
      name: 'Responder B User',
      email: 'pending-filter-b@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    const responderBToken = jwt.sign({ role: responderB.role }, 'test-access-secret', {
      subject: responderB.id,
      expiresIn: '15m'
    });
    const responderBResponse = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderBToken}`);

    expect(responderBResponse.status).toBe(200);
    expect(responderBResponse.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'declined-by-a',
      'available-to-a'
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
      const invalidToken = await request(app)
        .get(path)
        .set('Authorization', 'Bearer invalid-access-token');
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
      expect(invalidToken.status).toBe(401);
      expect(residentForbidden.status).toBe(403);
      expect(volunteerForbidden.status).toBe(403);
      expect(officerForbidden.status).toBe(403);
    }
  });

  it('allows an authenticated responder to accept a NEW request', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responder = await authRepository.createUser({
      name: 'Accepting Responder',
      email: 'accepting-responder@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    const responderToken = jwt.sign({ role: responder.role }, 'test-access-secret', {
      subject: responder.id,
      expiresIn: '15m'
    });
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'request-to-accept', status: 'NEW' })
    );

    const response = await request(app)
      .patch('/api/v1/response-requests/responder/requests/request-to-accept/accept')
      .send({ responderId: 'forged-responder-id' })
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'request-to-accept',
        status: 'ASSIGNED',
        assignedResponderId: responder.id,
        acceptedAt: expect.any(String)
      })
    );

    const pending = await request(app)
      .get('/api/v1/response-requests/responder/pending')
      .set('Authorization', `Bearer ${responderToken}`);
    const assigned = await request(app)
      .get('/api/v1/response-requests/responder/assigned')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(pending.body).toEqual([]);
    expect(assigned.body.map((responseRequest: SafeResponseRequest) => responseRequest.id)).toEqual([
      'request-to-accept'
    ]);
  });

  it('allows an authenticated responder to decline a NEW request without cancelling it', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responder = await authRepository.createUser({
      name: 'Declining Responder',
      email: 'declining-responder@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'EMERGENCY_RESPONDER'
    });
    const responderToken = jwt.sign({ role: responder.role }, 'test-access-secret', {
      subject: responder.id,
      expiresIn: '15m'
    });
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'request-to-decline', status: 'NEW' })
    );

    const response = await request(app)
      .patch('/api/v1/response-requests/responder/requests/request-to-decline/decline')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'request-to-decline',
        status: 'NEW',
        declinedByResponderIds: [responder.id]
      })
    );
    expect(response.body.assignedResponderId).toBeUndefined();
  });

  it('rejects decision actions for unauthenticated and non-responder users', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'protected-request', status: 'NEW' })
    );
    const residentToken = await createAccessToken(
      authRepository,
      'RESIDENT',
      'decision-resident@example.com'
    );
    const volunteerToken = await createAccessToken(
      authRepository,
      'COMMUNITY_VOLUNTEER',
      'decision-volunteer@example.com'
    );
    const officerToken = await createAccessToken(
      authRepository,
      'DISASTER_OFFICER',
      'decision-officer@example.com'
    );
    const paths = [
      '/api/v1/response-requests/responder/requests/protected-request/accept',
      '/api/v1/response-requests/responder/requests/protected-request/decline'
    ];

    for (const path of paths) {
      expect((await request(app).patch(path)).status).toBe(401);
      expect(
        (await request(app).patch(path).set('Authorization', `Bearer ${residentToken}`)).status
      ).toBe(403);
      expect(
        (await request(app).patch(path).set('Authorization', `Bearer ${volunteerToken}`)).status
      ).toBe(403);
      expect(
        (await request(app).patch(path).set('Authorization', `Bearer ${officerToken}`)).status
      ).toBe(403);
    }
  });

  it('returns a conflict for invalid, missing, or non-NEW decision targets', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'decision-conflict-responder@example.com'
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'assigned-target', status: 'ASSIGNED' })
    );

    const missingAccept = await request(app)
      .patch('/api/v1/response-requests/responder/requests/missing-target/accept')
      .set('Authorization', `Bearer ${responderToken}`);
    const assignedDecline = await request(app)
      .patch('/api/v1/response-requests/responder/requests/assigned-target/decline')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(missingAccept.status).toBe(409);
    expect(missingAccept.body.error).toEqual(
      expect.objectContaining({
        code: 'REQUEST_NOT_AVAILABLE',
        message: 'This emergency request is no longer available.'
      })
    );
    expect(assignedDecline.status).toBe(409);
  });

  it.each(['ASSIGNED', 'DISPATCHED', 'COMPLETED'] as const)(
    'rejects accepting a %s request',
    async (status) => {
      const { app, authRepository, responseRequestRepository } = createTestContext();
      const responderToken = await createAccessToken(
        authRepository,
        'EMERGENCY_RESPONDER',
        `accept-${status.toLowerCase()}@example.com`
      );
      responseRequestRepository.seedResponseRequest(
        createStoredResponseRequest({ id: `accept-${status.toLowerCase()}`, status })
      );

      const response = await request(app)
        .patch(`/api/v1/response-requests/responder/requests/accept-${status.toLowerCase()}/accept`)
        .set('Authorization', `Bearer ${responderToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('REQUEST_NOT_AVAILABLE');
    }
  );

  it('rejects declining a non-NEW request and prevents duplicate decline entries', async () => {
    const { app, authRepository, responseRequestRepository } = createTestContext();
    const responderToken = await createAccessToken(
      authRepository,
      'EMERGENCY_RESPONDER',
      'duplicate-decline@example.com'
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'decline-assigned', status: 'ASSIGNED' })
    );
    responseRequestRepository.seedResponseRequest(
      createStoredResponseRequest({ id: 'decline-new', status: 'NEW' })
    );

    const nonNewResponse = await request(app)
      .patch('/api/v1/response-requests/responder/requests/decline-assigned/decline')
      .set('Authorization', `Bearer ${responderToken}`);
    const firstDecline = await request(app)
      .patch('/api/v1/response-requests/responder/requests/decline-new/decline')
      .set('Authorization', `Bearer ${responderToken}`);
    const secondDecline = await request(app)
      .patch('/api/v1/response-requests/responder/requests/decline-new/decline')
      .set('Authorization', `Bearer ${responderToken}`);

    expect(nonNewResponse.status).toBe(409);
    expect(firstDecline.status).toBe(200);
    expect(secondDecline.status).toBe(200);
    expect(secondDecline.body.status).toBe('NEW');
    expect(secondDecline.body.declinedByResponderIds).toEqual([
      firstDecline.body.declinedByResponderIds[0]
    ]);
  });
});
