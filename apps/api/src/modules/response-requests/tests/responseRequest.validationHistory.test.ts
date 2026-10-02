import { EMERGENCY_CONTACT_PHONE_MESSAGE, EMERGENCY_VULNERABLE_COUNT_KEYS, RESPONSE_STATUSES, USER_ROLES, type CreateResponseRequestRequest, type SafeResponseRequest, type UserRole } from '@safealert/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { ResponseRequestModel } from '../models/responseRequest.model.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';
import { MongooseResponseRequestRepository } from '../repositories/mongooseResponseRequest.repository.js';

const basePath = '/api/v1/response-requests';
const residentId = '507f1f77bcf86cd799439001';
const responderId = '507f1f77bcf86cd799439002';
const otherResponderId = '507f1f77bcf86cd799439003';
const requestId = '507f1f77bcf86cd799439011';

function input(): CreateResponseRequestRequest {
  return {
    assistanceType: 'MEDICAL_ASSISTANCE', location: { type: 'Point', coordinates: [79.86, 6.92] },
    affectedPeople: 8, medicalNeeds: true, injuredPeople: 8,
    // Overlap is deliberate: the sum exceeds the total while each category is valid.
    vulnerablePeople: { children: 8, elderlyPeople: 8, personsWithDisabilities: 8, pregnantPersons: 8 },
    roadAccessibility: 'LIMITED', contact: { name: 'Resident', phoneNumber: '0771234567' },
    description: 'Medical evacuation required.'
  };
}

function stored(overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
  return { ...input(), id: requestId, residentId, status: 'NEW', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', ...overrides };
}

function context() {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'validation-history-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  repository.seedResponseRequest(stored());
  const app = createApp({ config, authRepository: new InMemoryAuthRepository(), responseRequestRepository: repository });
  const token = (id = residentId, role: UserRole = 'RESIDENT') => signAccessToken(config, { id, role });
  return { app, repository, token };
}

afterEach(() => vi.restoreAllMocks());

describe('Emergency request count and exact phone validation', () => {
  it.each(['create', 'edit'])('accepts overlapping categories up to eight and a ten-digit phone on %s', async (operation) => {
    const { app, token } = context();
    const response = await (operation === 'create' ? request(app).post(basePath) : request(app).patch(`${basePath}/mine/${requestId}`))
      .auth(token(), { type: 'bearer' }).send(input());
    expect(response.status).toBe(operation === 'create' ? 201 : 200);
    expect(response.body.responseRequest.vulnerablePeople).toEqual(input().vulnerablePeople);
    expect(response.body.responseRequest.injuredPeople).toBe(8);
    expect(response.body.responseRequest.contact.phoneNumber).toBe('0771234567');
  });

  it.each(['', '077123456', '07712345678', '077ABC4567', '077-123-4567', '077 123456', ' 0771234567', '0771234567 ', '+771234567', '０７７１２３４５６７'])('rejects invalid phone %j on both endpoints without changing storage', async (phoneNumber) => {
    const { app, token, repository } = context();
    const create = vi.spyOn(repository, 'createResponseRequest');
    const update = vi.spyOn(repository, 'updateResidentResponseRequest');
    const payload = { ...input(), contact: { ...input().contact, phoneNumber } };
    for (const operation of ['create', 'edit']) {
      const response = await (operation === 'create' ? request(app).post(basePath) : request(app).patch(`${basePath}/mine/${requestId}`))
        .auth(token(), { type: 'bearer' }).send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({ code: 'VALIDATION_ERROR', message: EMERGENCY_CONTACT_PHONE_MESSAGE });
    }
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(stored());
  });

  it.each([...EMERGENCY_VULNERABLE_COUNT_KEYS, 'injuredPeople'] as const)('rejects negative, fractional, or excessive %s counts in create and edit', async (key) => {
    for (const count of [-1, 1.5, 9]) {
      const { app, token, repository } = context();
      const payload = key === 'injuredPeople' ? { ...input(), injuredPeople: count }
        : { ...input(), vulnerablePeople: { ...input().vulnerablePeople, [key]: count } };
      for (const operation of ['create', 'edit']) {
        const response = await (operation === 'create' ? request(app).post(basePath) : request(app).patch(`${basePath}/mine/${requestId}`))
          .auth(token(), { type: 'bearer' }).send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(stored());
    }
  });

  it('rejects reducing total people below dependent counts, but accepts corrected zero counts', async () => {
    const { app, token } = context();
    const invalid = await request(app).patch(`${basePath}/mine/${requestId}`).auth(token(), { type: 'bearer' })
      .send({ ...input(), affectedPeople: 4, injuredPeople: 0 });
    expect(invalid.status).toBe(400);
    const corrected = await request(app).patch(`${basePath}/mine/${requestId}`).auth(token(), { type: 'bearer' })
      .send({ ...input(), affectedPeople: 4, injuredPeople: 0,
        vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 } });
    expect(corrected.status).toBe(200);
  });

  it('also enforces exact numeric phone format at the Mongoose model boundary', async () => {
    for (const phoneNumber of ['0771234567', '077ABC4567', '077-123-4567', ' 0771234567 ', '077123456', '07712345678', '']) {
      const document = new ResponseRequestModel({ ...input(), residentId, contact: { ...input().contact, phoneNumber } });
      if (phoneNumber === '0771234567') await expect(document.validate()).resolves.toBeUndefined();
      else await expect(document.validate()).rejects.toMatchObject({ errors: { 'contact.phoneNumber': expect.anything() } });
    }
  });
});

describe('Responder completed history authorization and lifecycle', () => {
  it('returns only the authenticated responder completed work, newest completion first', async () => {
    const { app, token, repository } = context();
    for (const [index, status] of RESPONSE_STATUSES.entries()) {
      repository.seedResponseRequest(stored({ id: `507f1f77bcf86cd79943902${index}`, status,
        assignedResponderId: responderId, ...(status === 'COMPLETED' ? { completedAt: '2026-10-01T10:00:00.000Z' } : {}) }));
    }
    const latest = stored({ id: '507f1f77bcf86cd799439040', assignedResponderId: responderId, status: 'COMPLETED',
      completedAt: '2026-10-02T10:00:00.000Z', assistanceProvided: 'Medical aid provided.', completionSummary: 'Resident safe.' });
    repository.seedResponseRequest(latest);
    repository.seedResponseRequest(stored({ id: '507f1f77bcf86cd799439041', assignedResponderId: otherResponderId, status: 'COMPLETED' }));
    const response = await request(app).get(`${basePath}/responder/completed`).auth(token(responderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })
      .query({ responderId: otherResponderId, status: 'ASSIGNED' }).send({ responderId: otherResponderId });
    expect(response.status).toBe(200);
    expect(response.body.map((entry: SafeResponseRequest) => entry.id)).toEqual([latest.id, '507f1f77bcf86cd799439025']);
    expect(response.body[0]).toMatchObject({ assistanceProvided: latest.assistanceProvided, completionSummary: latest.completionSummary, completedAt: latest.completedAt });
  });

  it('returns empty history for a responder with no completed assignments', async () => {
    const { app, token } = context();
    const response = await request(app).get(`${basePath}/responder/completed`).auth(token(responderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each(USER_ROLES.filter((role) => role !== 'EMERGENCY_RESPONDER'))('rejects %s history access at the backend', async (role) => {
    const { app, token, repository } = context();
    const lookup = vi.spyOn(repository, 'findCompletedResponseRequests');
    const response = await request(app).get(`${basePath}/responder/completed`).auth(token(residentId, role), { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects missing and invalid credentials', async () => {
    const { app, repository } = context();
    const lookup = vi.spyOn(repository, 'findCompletedResponseRequests');
    expect((await request(app).get(`${basePath}/responder/completed`)).status).toBe(401);
    expect((await request(app).get(`${basePath}/responder/completed`).auth('invalid-token', { type: 'bearer' })).status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('applies assignment and COMPLETED predicates inside the production database query', async () => {
    const exec = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ exec });
    const find = vi.spyOn(ResponseRequestModel, 'find').mockReturnValue({ sort } as unknown as ReturnType<typeof ResponseRequestModel.find>);
    await expect(new MongooseResponseRequestRepository().findCompletedResponseRequests(responderId)).resolves.toEqual([]);
    expect(find).toHaveBeenCalledWith({ assignedResponderId: responderId, status: 'COMPLETED' });
    expect(sort).toHaveBeenCalledWith({ completedAt: -1, createdAt: -1, _id: -1 });
  });

  it('reuses completed details and rejects subsequent operational writes or another responder reads', async () => {
    const { app, token, repository } = context();
    const completed = stored({ status: 'COMPLETED', assignedResponderId: responderId, completedAt: '2026-10-02T10:00:00.000Z',
      assistanceProvided: 'Evacuation completed.', completionSummary: 'All residents safe.' });
    repository.seedResponseRequest(completed);
    const ownToken = token(responderId, 'EMERGENCY_RESPONDER');
    const detail = await request(app).get(`${basePath}/responder/requests/${requestId}`).auth(ownToken, { type: 'bearer' });
    expect(detail.body).toEqual(completed);
    expect((await request(app).get(`${basePath}/responder/requests/${requestId}`).auth(token(otherResponderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })).status).toBe(403);
    expect((await request(app).patch(`${basePath}/${requestId}/progress`).auth(ownToken, { type: 'bearer' }).send({ status: 'DISPATCHED' })).status).toBe(409);
    expect((await request(app).patch(`${basePath}/${requestId}/field-update`).auth(ownToken, { type: 'bearer' }).send({ fieldNotes: 'Changed notes' })).status).toBe(409);
    expect(await repository.findResponseRequestForProgress(requestId)).toEqual(completed);
  });
});
