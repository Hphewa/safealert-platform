import {
  getNextResponseProgressStatus, getResponseProgressAction, isValidResponseProgressTransition,
  RESPONSE_STATUSES, USER_ROLES, type SafeResponseRequest
} from '@safealert/contracts';
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
import { cancelResponseRequestSchema } from '../validation/responseRequest.schemas.js';

const requestId = '507f1f77bcf86cd799439011';
const residentId = '507f1f77bcf86cd799439012';
const basePath = '/api/v1/response-requests';
const cancelPath = `${basePath}/${requestId}/cancel`;
const invalidStatusResponse = {
  error: {
    code: 'INVALID_CANCELLATION_STATUS',
    message: 'This emergency request cannot be cancelled in its current status. Refresh the request to see its latest progress.'
  }
};

function createContext() {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'cancellation-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  const storedRequest: SafeResponseRequest = {
    id: requestId,
    residentId,
    assistanceType: 'RESCUE_EVACUATION',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 2,
    medicalNeeds: false,
    injuredPeople: 0,
    vulnerablePeople: { children: 1, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'BLOCKED',
    contact: { name: 'Resident', phoneNumber: '+94775551234', email: 'resident@example.com' },
    description: 'Evacuation assistance needed.',
    specialRequirements: 'Accessible transport needed.',
    declinedByResponderIds: ['507f1f77bcf86cd799439097'],
    status: 'NEW',
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T08:00:00.000Z'
  };
  repository.seedResponseRequest(storedRequest);
  const app = createApp({
    config,
    authRepository: new InMemoryAuthRepository(),
    responseRequestRepository: repository
  });
  const actor = { id: residentId, role: 'RESIDENT' as const };
  return { app, config, repository, storedRequest, actor, token: signAccessToken(config, actor) };
}

function expectCancelledRequest(cancelled: SafeResponseRequest, original: SafeResponseRequest) {
  // Compare the whole record so an accidental replacement cannot discard original metadata.
  expect(cancelled).toEqual({
    ...original, status: 'CANCELLED', cancelledAt: expect.any(String), updatedAt: expect.any(String)
  });
  expect(Number.isFinite(Date.parse(cancelled.cancelledAt!))).toBe(true);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Resident cancellation persistence (LDFEW-323)', () => {
  it('writes status and server time in one conditional MongoDB update', async () => {
    const now = new Date('2026-09-29T10:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const { storedRequest } = createContext();
    const original = new ResponseRequestModel({ ...storedRequest, _id: requestId });
    expect(original.cancelledAt).toBeUndefined();
    const document = new ResponseRequestModel({
      ...storedRequest, _id: requestId, status: 'CANCELLED', cancelledAt: now, updatedAt: now
    });
    await expect(document.validate()).resolves.toBeUndefined();
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(document);
    const update = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);

    const result = await new MongooseResponseRequestRepository().cancelResponseRequest(requestId, residentId);
    expect(update).toHaveBeenCalledExactlyOnceWith(
      { _id: requestId, residentId, status: 'NEW' },
      { $set: { status: 'CANCELLED', cancelledAt: now } },
      { new: true, runValidators: true }
    );
    expect(result).toEqual({ ...storedRequest, status: 'CANCELLED', cancelledAt: now.toISOString(), updatedAt: now.toISOString() });
  });

  it('returns no result when the conditional MongoDB write no longer matches', async () => {
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);
    await expect(new MongooseResponseRequestRepository().cancelResponseRequest(requestId, residentId))
      .resolves.toBeNull();
  });

  it('uses server time for the persisted cancellation timestamp', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-09-29T10:00:00.000Z');
    vi.setSystemTime(now);
    const { actor, repository, storedRequest } = createContext();
    const result = await new ResponseRequestService(repository).cancelResidentResponseRequest(requestId, actor);
    expectCancelledRequest(result.responseRequest, storedRequest);
    expect(result.responseRequest.cancelledAt).toBe(now.toISOString());
    expect(result.responseRequest.updatedAt).toBe(now.toISOString());
  });

  it.each(['acceptance', 'ownership'] as const)('rejects concurrent %s changes between validation and persistence', async (change) => {
    const { app, token, repository, storedRequest } = createContext();
    const cancel = repository.cancelResponseRequest.bind(repository);
    let concurrentRequest: SafeResponseRequest | null = null;
    const update = vi.spyOn(repository, 'cancelResponseRequest').mockImplementationOnce(async (...args) => {
      if (change === 'acceptance') {
        concurrentRequest = await repository.acceptResponseRequest(requestId, '507f1f77bcf86cd799439099');
      } else {
        concurrentRequest = { ...storedRequest, residentId: '507f1f77bcf86cd799439098' };
        repository.seedResponseRequest(concurrentRequest);
      }
      return cancel(...args);
    });

    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: {
      code: 'REQUEST_CANCELLATION_CONFLICT',
      message: 'This emergency request changed before it could be cancelled. Refresh it and try again.'
    } });
    expect(update).toHaveBeenCalledExactlyOnceWith(requestId, residentId);
    expect(concurrentRequest).not.toBeNull();
    expect(await repository.findResponseRequestForCancellation(requestId)).toEqual(concurrentRequest);
  });

  it('allows only one of two concurrent cancellations to write', async () => {
    const { actor, repository, storedRequest } = createContext();
    const service = new ResponseRequestService(repository);
    const attempts = await Promise.allSettled([
      service.cancelResidentResponseRequest(requestId, actor),
      service.cancelResidentResponseRequest(requestId, actor)
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 409, code: 'REQUEST_CANCELLATION_CONFLICT' }) })
    ]);
    const persisted = await repository.findResponseRequestById(requestId, residentId);
    expect(persisted).not.toBeNull();
    expectCancelledRequest(persisted!, storedRequest);
  });

  it('does not repeat a committed cancellation if the initial response fails', async () => {
    const { app, token, repository } = createContext();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cancel = repository.cancelResponseRequest.bind(repository);
    const write = vi.spyOn(repository, 'cancelResponseRequest').mockImplementationOnce(async (...args) => {
      await cancel(...args);
      throw new Error('Connection lost after write');
    });
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } });
    const committed = structuredClone(await repository.findResponseRequestById(requestId, residentId));
    expect(committed?.status).toBe('CANCELLED');
    const retry = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual(invalidStatusResponse);
    expect(write).toHaveBeenCalledOnce();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(committed);
  });

  it('keeps CANCELLED terminal and outside the responder progress endpoint', async () => {
    for (const status of RESPONSE_STATUSES) {
      expect(isValidResponseProgressTransition('CANCELLED', status)).toBe(false);
      expect(isValidResponseProgressTransition(status, 'CANCELLED')).toBe(false);
    }
    expect(getNextResponseProgressStatus('CANCELLED')).toBeNull();
    expect(getResponseProgressAction('CANCELLED')).toBeNull();
    const { app, config, repository, storedRequest } = createContext();
    const token = signAccessToken(config, { id: '507f1f77bcf86cd799439099', role: 'EMERGENCY_RESPONDER' });
    const response = await request(app).patch(`${basePath}/${requestId}/progress`)
      .auth(token, { type: 'bearer' }).send({ status: 'CANCELLED' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(storedRequest);
  });
});

describe('Resident cancellation status eligibility (LDFEW-320)', () => {
  it('cancels an owned NEW request and keeps it available through Resident tracking', async () => {
    const { app, token, repository, storedRequest } = createContext();
    const before = structuredClone(storedRequest);
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expectCancelledRequest(response.body.responseRequest, before);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(response.body.responseRequest);
    const detail = await request(app).get(`${basePath}/mine/${requestId}`).auth(token, { type: 'bearer' });
    const list = await request(app).get(`${basePath}/mine`).auth(token, { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(response.body);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ responseRequests: [response.body.responseRequest] });
  });

  it.each(RESPONSE_STATUSES.filter((status) => status !== 'NEW'))(
    'rejects persisted %s without changing the request', async (status) => {
      const { app, token, actor, repository, storedRequest } = createContext();
      const persisted = { ...storedRequest, status };
      repository.seedResponseRequest(persisted);
      const before = structuredClone(persisted);
      const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
      expect(response.status).toBe(409);
      expect(response.body).toEqual(invalidStatusResponse);
      // Direct callers cannot bypass the lifecycle rule by skipping the controller.
      await expect(new ResponseRequestService(repository).cancelResidentResponseRequest(requestId, actor))
        .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_CANCELLATION_STATUS' });
      expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
    }
  );

  it.each(['CANCELLED', 'UNRECOGNIZED_STATUS'])(
    'rejects repeated cancellation of a database record with status %s', async (status) => {
      const { config, token, storedRequest } = createContext();
      // Hydration also exercises unexpected database values without weakening the status contract.
      const document = ResponseRequestModel.hydrate({ ...storedRequest, _id: requestId, status });
      const before = document.toObject();
      const query = ResponseRequestModel.findById(requestId);
      vi.spyOn(query, 'exec').mockResolvedValue(document);
      vi.spyOn(ResponseRequestModel, 'findById').mockReturnValue(query);
      const app = createApp({
        config,
        authRepository: new InMemoryAuthRepository(),
        responseRequestRepository: new MongooseResponseRequestRepository()
      });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
        expect(response.status).toBe(409);
        expect(response.body).toEqual(invalidStatusResponse);
      }
      expect(document.status).toBe(status);
      expect(document.toObject()).toEqual(before);
    }
  );

  it('re-reads persisted status after a responder accepts a request the Resident viewed as NEW', async () => {
    const { app, config, token, repository } = createContext();
    const viewed = await request(app).get(`${basePath}/mine/${requestId}`).auth(token, { type: 'bearer' });
    expect(viewed.status).toBe(200);
    expect(viewed.body.responseRequest.status).toBe('NEW');

    const responderToken = signAccessToken(config, { id: '507f1f77bcf86cd799439099', role: 'EMERGENCY_RESPONDER' });
    const accepted = await request(app).patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responderToken, { type: 'bearer' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('ASSIGNED');
    const before = structuredClone(await repository.findResponseRequestById(requestId, residentId));

    const cancellation = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(cancellation.status).toBe(409);
    expect(cancellation.body).toEqual(invalidStatusResponse);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
  });

  it.each(['body', 'query'])('rejects frontend-supplied status in the %s without changing persisted status', async (location) => {
    const { app, token, repository, storedRequest } = createContext();
    const persisted: SafeResponseRequest = { ...storedRequest, status: 'COMPLETED' };
    repository.seedResponseRequest(persisted);
    const before = structuredClone(persisted);
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    const attempt = request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    const response = await (location === 'body' ? attempt.send({ status: 'NEW' }) : attempt.query({ status: 'NEW' }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(lookup).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
  });

  it('checks ownership before lifecycle eligibility without exposing another Resident request status', async () => {
    const { app, config, repository, storedRequest } = createContext();
    const persisted: SafeResponseRequest = { ...storedRequest, status: 'COMPLETED' };
    repository.seedResponseRequest(persisted);
    const before = structuredClone(persisted);
    const token = signAccessToken(config, { id: '507f1f77bcf86cd799439098', role: 'RESIDENT' });
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: {
      code: 'REQUEST_NOT_OWNED', message: 'You are not authorized to cancel this emergency request.'
    } });
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
  });
});

describe('Resident cancellation API foundation and ownership (LDFEW-318/319)', () => {
  it('passes the authenticated actor through the service to the existing repository lookup', async () => {
    const { app, token, actor, repository, storedRequest } = createContext();
    const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');

    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });

    expect(service).toHaveBeenCalledExactlyOnceWith(requestId, actor);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(requestId);
    expect(response.status).toBe(200);
    expectCancelledRequest(response.body.responseRequest, storedRequest);
  });

  it('accepts an empty body and normalizes uppercase identifiers using the existing service', async () => {
    const { app, token, repository, storedRequest } = createContext();
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    const response = await request(app).patch(`${basePath}/${requestId.toUpperCase()}/cancel`)
      .auth(token, { type: 'bearer' }).send({});
    expect(response.status).toBe(200);
    expectCancelledRequest(response.body.responseRequest, storedRequest);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(requestId);
  });

  it('rejects repeated cancellation without changing the saved record or cancellation timestamp', async () => {
    const { app, token, repository, storedRequest } = createContext();
    const first = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(first.status).toBe(200);
    expectCancelledRequest(first.body.responseRequest, storedRequest);
    const before = structuredClone(first.body.responseRequest);
    const write = vi.spyOn(repository, 'cancelResponseRequest');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
      expect(response.status).toBe(409);
      expect(response.body).toEqual(invalidStatusResponse);
    }
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['not-an-id', '123', 'abcdefghijkl', 'z'.repeat(24), ' ', '{"$ne":null}', '../request', 'requests/cancel'])(
    'rejects malformed ID %j before the service or repository', async (id) => {
      const { app, token, repository } = createContext();
      const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
      const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
      const response = await request(app).patch(`${basePath}/${encodeURIComponent(id)}/cancel`)
        .auth(token, { type: 'bearer' });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'A valid response request id is required.' }
      });
      expect(service).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
    }
  );

  it('handles a missing path ID through the existing route-not-found convention', async () => {
    const { app, token, repository } = createContext();
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    const response = await request(app).patch(`${basePath}/cancel`).auth(token, { type: 'bearer' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(lookup).not.toHaveBeenCalled();
    expect(cancelResponseRequestSchema.safeParse({ params: {}, body: {}, query: {} }).success).toBe(false);
  });

  it.each([{ residentId: 'another-user' }, { status: 'CANCELLED' }, { cancelledAt: '2000-01-01T00:00:00.000Z' }, { reason: 'anything' }, []])(
    'rejects unsupported body %j before reaching the service', async (body) => {
      const { app, token } = createContext();
      const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
      const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' }).send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(service).not.toHaveBeenCalled();
    }
  );

  it('rejects unsupported query parameters', async () => {
    const { app, token } = createContext();
    const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' })
      .query({ residentId: 'another-user' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(service).not.toHaveBeenCalled();
  });

  it('returns the existing not-found error for a nonexistent request', async () => {
    const { app, token } = createContext();
    const response = await request(app).patch(`${basePath}/507f1f77bcf86cd799439099/cancel`)
      .auth(token, { type: 'bearer' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } });
  });

  it('rejects a different Resident without exposing owner details or changing the request', async () => {
    const { app, config, repository, storedRequest } = createContext();
    const before = structuredClone(storedRequest);
    const token = signAccessToken(config, { id: '507f1f77bcf86cd799439098', role: 'RESIDENT' });
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: {
      code: 'REQUEST_NOT_OWNED', message: 'You are not authorized to cancel this emergency request.'
    } });
    expect(lookup).toHaveBeenCalledExactlyOnceWith(requestId);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
    expect(await repository.findPendingResponseRequests('responder')).toEqual([before]);
  });

  it.each(['residentId', 'userId', 'ownerId'])('does not trust a spoofed %s in the body or query', async (field) => {
    const { app, config, repository, storedRequest } = createContext();
    const before = structuredClone(storedRequest);
    const token = signAccessToken(config, { id: '507f1f77bcf86cd799439098', role: 'RESIDENT' });
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    for (const location of ['body', 'query']) {
      const attempt = request(app).patch(cancelPath).auth(token, { type: 'bearer' });
      const response = await (location === 'body'
        ? attempt.send({ [field]: residentId })
        : attempt.query({ [field]: residentId }));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
  });

  it('rejects missing or blank authenticated identity before looking up the request', async () => {
    const { app, config, repository } = createContext();
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    for (const id of ['', ' ']) {
      const token = signAccessToken(config, { id, role: 'RESIDENT' });
      const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
      expect(response.status).toBe(401);
      expect(['INVALID_TOKEN', 'UNAUTHORIZED']).toContain(response.body.error.code);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('enforces ownership for direct service callers as well as HTTP callers', async () => {
    const { actor, repository, storedRequest } = createContext();
    const before = structuredClone(storedRequest);
    const service = new ResponseRequestService(repository);
    await expect(service.cancelResidentResponseRequest(requestId, { ...actor, id: 'another-resident' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'REQUEST_NOT_OWNED' });
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);
    const result = await service.cancelResidentResponseRequest(requestId, actor);
    expectCancelledRequest(result.responseRequest, before);
  });

  it('uses the stored MongoDB owner as a string for ownership authorization', async () => {
    const { actor, storedRequest } = createContext();
    const document = new ResponseRequestModel({ ...storedRequest, _id: requestId });
    const query = ResponseRequestModel.findById(requestId);
    vi.spyOn(query, 'exec').mockResolvedValue(document);
    const find = vi.spyOn(ResponseRequestModel, 'findById').mockReturnValue(query);
    const cancelledDocument = new ResponseRequestModel({
      ...storedRequest, _id: requestId, status: 'CANCELLED', cancelledAt: new Date()
    });
    const updateQuery = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(updateQuery, 'exec').mockResolvedValue(cancelledDocument);
    const update = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValue(updateQuery);
    const service = new ResponseRequestService(new MongooseResponseRequestRepository());

    await expect(service.cancelResidentResponseRequest(requestId, actor))
      .resolves.toEqual({ responseRequest: toSafeResponseRequest(cancelledDocument) });
    await expect(service.cancelResidentResponseRequest(requestId, { ...actor, id: 'another-resident' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'REQUEST_NOT_OWNED' });
    expect(find).toHaveBeenCalledWith(requestId);
    expect(update).toHaveBeenCalledOnce();
    expect(document.residentId.toString()).toBe(residentId);
    expect(document.status).toBe('NEW');
  });

  it('rejects missing, invalid and expired credentials before service access', async () => {
    const { app, config, actor } = createContext();
    const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
    expect((await request(app).patch(cancelPath)).status).toBe(401);
    const expired = signAccessToken({ ...config, jwtAccessExpiresIn: '-1s' }, actor);
    for (const token of ['invalid-token', expired]) {
      const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    }
    expect(service).not.toHaveBeenCalled();
  });

  it.each(USER_ROLES.filter((role) => role !== 'RESIDENT'))('rejects the %s role', async (role) => {
    const { app, config } = createContext();
    const service = vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest');
    const token = signAccessToken(config, { id: residentId, role });
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(service).not.toHaveBeenCalled();
  });

  it.each(['repository', 'service', 'write'] as const)('sanitizes unexpected %s failures', async (source) => {
    const { app, token, repository, storedRequest } = createContext();
    const before = structuredClone(storedRequest);
    // The shared handler logs server diagnostics; the client must receive only its generic error.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('MongoServerError: internal database details');
    const failedCall = source === 'repository'
      ? vi.spyOn(repository, 'findResponseRequestForCancellation').mockRejectedValueOnce(failure)
      : source === 'write'
        ? vi.spyOn(repository, 'cancelResponseRequest').mockRejectedValueOnce(failure)
        : vi.spyOn(ResponseRequestService.prototype, 'cancelResidentResponseRequest').mockRejectedValueOnce(failure);
    const response = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(failedCall).toHaveBeenCalledOnce();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' } });
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(before);

    const retry = await request(app).patch(cancelPath).auth(token, { type: 'bearer' });
    expect(retry.status).toBe(200);
    expectCancelledRequest(retry.body.responseRequest, before);
  });

  it('validates service callers before repository access', async () => {
    const { actor, repository } = createContext();
    const service = new ResponseRequestService(repository);
    const lookup = vi.spyOn(repository, 'findResponseRequestForCancellation');
    await expect(service.cancelResidentResponseRequest(requestId, undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.cancelResidentResponseRequest(requestId, null)).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.cancelResidentResponseRequest(requestId, { ...actor, role: 'EMERGENCY_RESPONDER' }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(service.cancelResidentResponseRequest(requestId, { ...actor, id: '' }))
      .rejects.toMatchObject({ statusCode: 401 });
    for (const id of ['', 'invalid']) {
      await expect(service.cancelResidentResponseRequest(id, actor))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REQUEST_ID' });
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
