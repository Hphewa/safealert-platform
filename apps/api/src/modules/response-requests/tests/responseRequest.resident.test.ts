import { RESPONSE_PROGRESS_SEQUENCE, RESPONSE_STATUSES, USER_ROLES, type SafeResponseRequest, type UserRole } from '@safealert/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { ResponseRequestModel, toSafeResponseRequest } from '../models/responseRequest.model.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import { MongooseResponseRequestRepository } from '../repositories/mongooseResponseRequest.repository.js';
import { ResponseRequestService } from '../services/responseRequest.service.js';

const basePath = '/api/v1/response-requests';
const requestId = '507f1f77bcf86cd799439011';
const otherRequestId = '507f1f77bcf86cd799439012';
const missingRequestId = '507f1f77bcf86cd799439013';
const residentPaths = [`${basePath}/mine`, `${basePath}/mine/${requestId}`];

function storedRequest(residentId: string, overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
  return {
    id: requestId,
    residentId,
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 4,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'LIMITED',
    contact: { name: 'Resident A', phoneNumber: '+94-77-555-1234', email: 'resident-a@example.com' },
    description: 'Medical transport is needed.',
    specialRequirements: 'Wheelchair accessible transport.',
    status: 'NEW',
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides
  };
}

async function createContext() {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'resident-tracking-test-secret' };
  const authRepository = new InMemoryAuthRepository();
  const responseRequestRepository = new InMemoryResponseRequestRepository();
  const app = createApp({ config, authRepository, responseRequestRepository });
  const createActor = async (role: UserRole, email: string) => {
    const user = await authRepository.createUser({ name: role, email, passwordHash: 'unused', role });
    return { id: user.id, token: signAccessToken(config, user) };
  };
  const resident = await createActor('RESIDENT', 'resident-a@example.com');
  const otherResident = await createActor('RESIDENT', 'resident-b@example.com');
  const ownRequest = storedRequest(resident.id);
  const otherRequest = storedRequest(otherResident.id, { id: otherRequestId });
  responseRequestRepository.seedResponseRequest(ownRequest);
  responseRequestRepository.seedResponseRequest(otherRequest);
  return { app, config, authRepository, resident, otherResident, ownRequest, otherRequest, responseRequestRepository, createActor };
}

afterEach(() => vi.restoreAllMocks());

describe('resident emergency request retrieval', () => {
  it('returns only the authenticated resident requests, newest first, across every lifecycle status', async () => {
    const { app, resident, ownRequest, responseRequestRepository } = await createContext();
    const expected = RESPONSE_STATUSES.map((status, index) => storedRequest(resident.id, {
      id: index === 0 ? requestId : `507f1f77bcf86cd79943902${index}`,
      status,
      createdAt: `2026-09-23T10:0${index}:00.000Z`
    }));
    for (const entry of expected) responseRequestRepository.seedResponseRequest(entry);

    const response = await request(app).get(`${basePath}/mine`).auth(resident.token, { type: 'bearer' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ responseRequests: [...expected].reverse() });
    expect(response.body.responseRequests).toContainEqual(ownRequest);
  });

  it('returns an empty list when only another resident has requests', async () => {
    const { app, createActor } = await createContext();
    const resident = await createActor('RESIDENT', 'empty@example.com');
    const response = await request(app).get(`${basePath}/mine`).auth(resident.token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ responseRequests: [] });
  });

  it('ignores attempted ownership overrides from query parameters and the body', async () => {
    const { app, resident, otherResident, ownRequest, otherRequest } = await createContext();
    const list = await request(app).get(`${basePath}/mine`)
      .auth(resident.token, { type: 'bearer' })
      .query({ residentId: otherResident.id, status: 'COMPLETED' })
      .send({ residentId: otherResident.id });
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ responseRequests: [ownRequest] });

    const detail = await request(app).get(`${basePath}/mine/${otherRequest.id}`)
      .auth(resident.token, { type: 'bearer' })
      .query({ residentId: otherResident.id })
      .send({ residentId: otherResident.id });
    expect(detail.status).toBe(404);
    expect(detail.body).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } });
  });

  it('retrieves the owner details and treats another owner exactly like a nonexistent request', async () => {
    const { app, resident, otherResident, ownRequest } = await createContext();
    const own = await request(app).get(`${basePath}/mine/${requestId}`).auth(resident.token, { type: 'bearer' });
    expect(own.status).toBe(200);
    expect(own.body).toEqual({ responseRequest: ownRequest });

    const denied = await request(app).get(`${basePath}/mine/${requestId}`).auth(otherResident.token, { type: 'bearer' });
    const missing = await request(app).get(`${basePath}/mine/${missingRequestId}`).auth(otherResident.token, { type: 'bearer' });
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(denied.body).toEqual(missing.body);
    expect(denied.body).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } });
  });

  it('normalizes uppercase ObjectIds for details', async () => {
    const { app, resident, ownRequest } = await createContext();
    const response = await request(app).get(`${basePath}/mine/${requestId.toUpperCase()}`)
      .auth(resident.token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ responseRequest: ownRequest });
  });

  it.each(['not-an-id', '123', 'abcdefghijkl', 'z'.repeat(24), ' ', '{"$ne":null}'])('rejects malformed request ID %j before querying', async (id) => {
    const { app, resident, responseRequestRepository } = await createContext();
    const lookup = vi.spyOn(responseRequestRepository, 'findResponseRequestById');
    const response = await request(app).get(`${basePath}/mine/${encodeURIComponent(id)}`)
      .auth(resident.token, { type: 'bearer' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST_ID');
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(residentPaths)('requires authentication for %s', async (path) => {
    const { app } = await createContext();
    expect((await request(app).get(path)).status).toBe(401);
    const invalid = await request(app).get(path).auth('invalid-token', { type: 'bearer' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
  });

  it.each(residentPaths)('rejects expired Resident credentials before reading %s', async (path) => {
    const { app, config, resident, responseRequestRepository } = await createContext();
    const token = signAccessToken({ ...config, jwtAccessExpiresIn: '-1s' }, { id: resident.id, role: 'RESIDENT' });
    const list = vi.spyOn(responseRequestRepository, 'findResponseRequestsByResidentId');
    const detail = vi.spyOn(responseRequestRepository, 'findResponseRequestById');
    const response = await request(app).get(path).auth(token, { type: 'bearer' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(response.body.responseRequest).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  it.each(USER_ROLES.filter((role) => role !== 'RESIDENT'))('rejects %s access to both resident endpoints', async (role) => {
    const { app, createActor } = await createContext();
    const actor = await createActor(role, `${role}@example.com`);
    for (const path of residentPaths) {
      const response = await request(app).get(path).auth(actor.token, { type: 'bearer' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('reads the same persisted status and timestamps after acceptance and every responder progress update', async () => {
    const { app, config, authRepository, resident, otherResident, createActor, responseRequestRepository } = await createContext();
    const responder = await createActor('EMERGENCY_RESPONDER', 'responder@example.com');
    const accepted = await request(app).patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responder.token, { type: 'bearer' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('ASSIGNED');
    let persisted: SafeResponseRequest = accepted.body;

    for (const status of RESPONSE_PROGRESS_SEQUENCE) {
      if (status !== 'ASSIGNED') {
        const update = await request(app).patch(`${basePath}/${requestId}/progress`)
          .auth(responder.token, { type: 'bearer' }).send({ status });
        expect(update.status).toBe(200);
        persisted = update.body;
      }
      const detail = await request(app).get(`${basePath}/mine/${requestId}`).auth(resident.token, { type: 'bearer' });
      const list = await request(app).get(`${basePath}/mine`).auth(resident.token, { type: 'bearer' });
      expect(detail.status).toBe(200);
      expect(list.status).toBe(200);
      expect(detail.body).toEqual({ responseRequest: persisted });
      expect(list.body).toEqual({ responseRequests: [persisted] });
      expect(persisted.status).toBe(status);
      // Recreate the API/service layer so this read cannot rely on the previous handler's state.
      // This suite uses an in-memory repository; the opt-in persistence suite tests a MongoDB reconnect.
      const reopenedApp = createApp({ config, authRepository, responseRequestRepository });
      const reopened = await request(reopenedApp).get(`${basePath}/mine/${requestId}`)
        .auth(resident.token, { type: 'bearer' });
      expect(reopened.body).toEqual({ responseRequest: persisted });
      const denied = await request(reopenedApp).get(`${basePath}/mine/${requestId}`)
        .auth(otherResident.token, { type: 'bearer' });
      expect(denied.status).toBe(404);
      expect(denied.body).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } });
    }

    for (const field of ['acceptedAt', 'dispatchedAt', 'arrivedAt', 'inProgressAt', 'completedAt'] as const) {
      expect(persisted[field]).toEqual(expect.any(String));
    }
    const assigned = await request(app).get(`${basePath}/responder/assigned`).auth(responder.token, { type: 'bearer' });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toEqual([]);
  });

  it('fails closed before repository access if the authenticated identity is missing', async () => {
    const repository = new InMemoryResponseRequestRepository();
    const list = vi.spyOn(repository, 'findResponseRequestsByResidentId');
    const detail = vi.spyOn(repository, 'findResponseRequestById');
    const service = new ResponseRequestService(repository);
    await expect(service.listResidentResponseRequests('')).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.getResidentResponseRequestById(' ', requestId)).rejects.toMatchObject({ statusCode: 401 });
    expect(list).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });
});

describe('resident request MongoDB ownership queries', () => {
  const residentId = '507f1f77bcf86cd799439014';

  it('filters lists by resident at the database boundary with deterministic newest-first ordering', async () => {
    const document = new ResponseRequestModel({ ...storedRequest(residentId), _id: requestId });
    const query = ResponseRequestModel.find();
    vi.spyOn(query, 'exec').mockResolvedValue([document]);
    const find = vi.spyOn(ResponseRequestModel, 'find').mockReturnValueOnce(query);
    const result = await new MongooseResponseRequestRepository().findResponseRequestsByResidentId(residentId);
    expect(find).toHaveBeenCalledExactlyOnceWith({ residentId });
    expect(query.getOptions().sort).toEqual({ createdAt: -1, _id: -1 });
    expect(result).toEqual([toSafeResponseRequest(document)]);
  });

  it('includes both request ID and resident ID in the reused detail query', async () => {
    const query = ResponseRequestModel.findOne();
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const find = vi.spyOn(ResponseRequestModel, 'findOne').mockReturnValueOnce(query);
    const service = new ResponseRequestService(new MongooseResponseRequestRepository());
    await expect(service.getResidentResponseRequestById(residentId, requestId))
      .rejects.toMatchObject({ statusCode: 404, code: 'REQUEST_NOT_FOUND' });
    expect(find).toHaveBeenCalledExactlyOnceWith({ _id: requestId, residentId });
  });
});
