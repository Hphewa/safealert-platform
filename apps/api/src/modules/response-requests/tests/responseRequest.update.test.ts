import { RESPONSE_EDITABLE_STATUS, RESPONSE_PROGRESS_SEQUENCE, RESPONSE_STATUSES, USER_ROLES, type SafeResponseRequest, type UpdateResponseRequestRequest, type UserRole } from '@safealert/contracts';
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

const requestId = '507f1f77bcf86cd799439011';
const residentId = '507f1f77bcf86cd799439012';
const responderId = '507f1f77bcf86cd799439013';
const basePath = '/api/v1/response-requests';
const editPath = `${basePath}/mine/${requestId}`;

function editableInput(): UpdateResponseRequestRequest {
  return {
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 4,
    medicalNeeds: true,
    injuredPeople: 2,
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'LIMITED',
    contact: { name: 'Resident A', phoneNumber: '+94-77-555-1234', email: 'resident@example.com' },
    description: 'Two residents now need medical assistance.',
    specialRequirements: 'Wheelchair accessible transport.'
  };
}

function context(overrides: Partial<SafeResponseRequest> = {}) {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'resident-edit-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  const original: SafeResponseRequest = {
    ...editableInput(), id: requestId, residentId, status: 'NEW', injuredPeople: 1,
    description: 'One resident needs assistance.', declinedByResponderIds: [responderId],
    createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides
  };
  repository.seedResponseRequest(original);
  const freshApp = () => createApp({ config, authRepository: new InMemoryAuthRepository(), responseRequestRepository: repository });
  const token = (id = residentId, role: UserRole = 'RESIDENT') => signAccessToken(config, { id, role });
  return { config, repository, original, app: freshApp(), freshApp, token };
}

afterEach(() => vi.restoreAllMocks());

describe('LDFEW-338 Resident update API', () => {
  it('updates the existing record and returns changed values on fresh authenticated tracking reads', async () => {
    const { app, freshApp, token, original, repository } = context();
    const create = vi.spyOn(repository, 'createResponseRequest');
    const input = editableInput();
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(input);
    expect(response.status).toBe(200);
    expect(response.body.responseRequest).toEqual({ ...original, ...input, updatedAt: expect.any(String) });
    expect(response.body.responseRequest.updatedAt).not.toBe(original.updatedAt);
    expect(create).not.toHaveBeenCalled();

    // Recreate handlers and credentials so verification reads repository state,
    // not the previous response or a mobile cache.
    const reopened = freshApp();
    const detail = await request(reopened).get(editPath).auth(token(), { type: 'bearer' });
    const list = await request(reopened).get(`${basePath}/mine`).auth(token(), { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(response.body);
    expect(list.body.responseRequests).toEqual([response.body.responseRequest]);
  });

  it.each([undefined, '', '   '])('clears optional notes (%j) and omitted contact email', async (notes) => {
    const { app, token } = context();
    const input = editableInput();
    delete input.contact.email;
    delete input.specialRequirements;
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
      .send({ ...input, ...(notes !== undefined ? { specialRequirements: notes } : {}) });
    expect(response.status).toBe(200);
    expect(response.body.responseRequest.specialRequirements).toBeUndefined();
    expect(response.body.responseRequest.contact.email).toBeUndefined();
  });

  it('normalizes uppercase IDs and trims editable text', async () => {
    const { app, token } = context();
    const response = await request(app).patch(`${basePath}/mine/${requestId.toUpperCase()}`)
      .auth(token(), { type: 'bearer' }).send({ ...editableInput(), description: '  Updated description  ' });
    expect(response.status).toBe(200);
    expect(response.body.responseRequest.description).toBe('Updated description');
  });

  it('requires a valid authenticated session', async () => {
    const { app, repository, original } = context();
    expect((await request(app).patch(editPath).send(editableInput())).status).toBe(401);
    expect((await request(app).patch(editPath).auth('invalid', { type: 'bearer' }).send(editableInput())).status).toBe(401);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it.each(USER_ROLES.filter((role) => role !== 'RESIDENT'))('rejects the %s role', async (role) => {
    const { app, token, repository, original } = context();
    const response = await request(app).patch(editPath).auth(token(residentId, role), { type: 'bearer' }).send(editableInput());
    expect(response.status).toBe(403);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it('does not disclose or update another Resident request', async () => {
    const { app, token, repository, original } = context();
    const otherToken = token('507f1f77bcf86cd799439014');
    const denied = await request(app).patch(editPath).auth(otherToken, { type: 'bearer' }).send(editableInput());
    const missing = await request(app).patch(`${basePath}/mine/507f1f77bcf86cd799439015`)
      .auth(otherToken, { type: 'bearer' }).send(editableInput());
    expect(denied.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(denied.body).toEqual(missing.body);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it.each(RESPONSE_STATUSES.filter((status) => status !== 'NEW'))('does not edit %s requests', async (status) => {
    const { app, token, repository, original } = context({ status });
    const write = vi.spyOn(repository, 'updateResidentResponseRequest');
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(editableInput());
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: {
      code: 'INVALID_EDIT_STATUS', message: 'This request can no longer be edited because its status has changed.'
    } });
    expect(write).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it.each([
    {}, { description: 'Missing other required information' },
    { ...editableInput(), assistanceType: 'INVALID' },
    { ...editableInput(), affectedPeople: 0 },
    { ...editableInput(), affectedPeople: 1.5 },
    { ...editableInput(), injuredPeople: -1 },
    { ...editableInput(), injuredPeople: 5 },
    { ...editableInput(), medicalNeeds: false },
    { ...editableInput(), medicalNeeds: 'yes' },
    { ...editableInput(), vulnerablePeople: { ...editableInput().vulnerablePeople, children: -1 } },
    { ...editableInput(), vulnerablePeople: { ...editableInput().vulnerablePeople, pregnantPersons: 0.5 } },
    { ...editableInput(), location: { type: 'Point', coordinates: [181, 0] } },
    { ...editableInput(), location: { type: 'Point', coordinates: [0, 91] } },
    { ...editableInput(), location: { type: 'Point', coordinates: [0] } },
    { ...editableInput(), contact: { ...editableInput().contact, phoneNumber: '' } },
    { ...editableInput(), contact: { ...editableInput().contact, name: ' ' } },
    { ...editableInput(), contact: { ...editableInput().contact, email: 'invalid' } },
    { ...editableInput(), roadAccessibility: 'INVALID' },
    { ...editableInput(), description: '  ' },
    { ...editableInput(), description: 'x'.repeat(1001) },
    { ...editableInput(), specialRequirements: 'x'.repeat(501) }
  ])('rejects invalid edit payload %# without writing', async (body) => {
    const { app, token, repository, original } = context();
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it.each([
    'id', '_id', 'residentId', 'userId', 'status', 'assignedResponderId', 'declinedByResponderIds',
    'acceptedAt', 'dispatchedAt', 'arrivedAt', 'inProgressAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt', '__v'
  ])('rejects client-controlled %s', async (field) => {
    const { app, token, repository, original } = context();
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
      .send({ ...editableInput(), [field]: 'spoofed' });
    expect(response.status).toBe(400);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it('rejects invalid IDs, query overrides and nested unknown fields', async () => {
    const { app, token, repository } = context();
    const update = vi.spyOn(repository, 'updateResidentResponseRequest');
    for (const path of [`${basePath}/mine/invalid`, `${editPath}?residentId=${residentId}`]) {
      expect((await request(app).patch(path).auth(token(), { type: 'bearer' }).send(editableInput())).status).toBe(400);
    }
    const nested = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
      .send({ ...editableInput(), contact: { ...editableInput().contact, residentId } });
    expect(nested.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['accept', 'cancel'] as const)('rejects a write if %s wins after the initial lookup', async (action) => {
    const { app, token, repository, original } = context();
    const write = repository.updateResidentResponseRequest.bind(repository);
    let changedRequest: SafeResponseRequest | null = null;
    const update = vi.spyOn(repository, 'updateResidentResponseRequest').mockImplementationOnce(async (...args) => {
      // Deterministically interleave a real authenticated lifecycle operation
      // after the service read but before its write. No timing/sleep assumptions.
      expect((await repository.findResponseRequestById(requestId, residentId))?.status).toBe(RESPONSE_EDITABLE_STATUS);
      const transition = action === 'accept'
        ? await request(app).patch(`${basePath}/responder/requests/${requestId}/accept`)
          .auth(token(responderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })
        : await request(app).patch(`${basePath}/${requestId}/cancel`).auth(token(), { type: 'bearer' });
      expect(transition.status).toBe(200);
      changedRequest = await repository.findResponseRequestById(requestId, residentId);
      return write(...args);
    });
    const response = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(editableInput());
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: {
      code: 'REQUEST_EDIT_CONFLICT', message: 'This request changed before it could be updated. Refresh it to see its latest status.'
    } });
    expect(update).toHaveBeenCalledTimes(1);
    const refreshed = await request(app).get(editPath).auth(token(), { type: 'bearer' });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.responseRequest).toMatchObject({
      status: action === 'accept' ? 'ASSIGNED' : 'CANCELLED', injuredPeople: original.injuredPeople,
      description: original.description
    });
    // Exact equality protects assignment, all emergency fields and timestamps,
    // including updatedAt, from being touched by the rejected Resident edit.
    expect(changedRequest).not.toBeNull();
    expect(refreshed.body.responseRequest).toEqual(changedRequest);
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(changedRequest);
  });
});

describe('LDFEW-340 edit lifecycle boundaries', () => {
  it('preserves NEW on edit, then prevents further edits throughout the responder lifecycle', async () => {
    const { app, token, original } = context();
    const changed = editableInput();
    const edited = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(changed);
    expect(edited.status).toBe(200);
    expect(edited.body.responseRequest).toEqual({ ...original, ...changed, updatedAt: expect.any(String) });
    expect(edited.body.responseRequest.status).toBe(RESPONSE_EDITABLE_STATUS);

    const responderToken = token(responderId, 'EMERGENCY_RESPONDER');
    for (const status of RESPONSE_PROGRESS_SEQUENCE) {
      const transition = status === 'ASSIGNED'
        ? await request(app).patch(`${basePath}/responder/requests/${requestId}/accept`).auth(responderToken, { type: 'bearer' })
        : await request(app).patch(`${basePath}/${requestId}/progress`).auth(responderToken, { type: 'bearer' }).send({ status });
      expect(transition.status).toBe(200);
      expect(transition.body).toMatchObject({ ...changed, status, assignedResponderId: responderId });
      const rejected = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
        .send({ ...changed, description: 'This stale edit must not persist.' });
      expect(rejected.status).toBe(409);
      expect(rejected.body.error.code).toBe('INVALID_EDIT_STATUS');
      const refreshed = await request(app).get(editPath).auth(token(), { type: 'bearer' });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.responseRequest).toEqual(transition.body);
    }
  });

  it('allows cancellation after editing a NEW request and preserves the cancelled record on later edits', async () => {
    const { app, token } = context();
    const changed = editableInput();
    const edited = await request(app).patch(editPath).auth(token(), { type: 'bearer' }).send(changed);
    expect(edited.status).toBe(200);
    const cancelled = await request(app).patch(`${basePath}/${requestId}/cancel`).auth(token(), { type: 'bearer' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.responseRequest).toMatchObject({ ...changed, status: 'CANCELLED' });
    const rejected = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
      .send({ ...changed, injuredPeople: 3 });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('INVALID_EDIT_STATUS');
    const refreshed = await request(app).get(editPath).auth(token(), { type: 'bearer' });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual(cancelled.body);
  });

  it('rejects a client attempt to restore NEW on an accepted request', async () => {
    const { app, token, repository } = context();
    const accepted = await request(app).patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(token(responderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' });
    expect(accepted.status).toBe(200);
    const write = vi.spyOn(repository, 'updateResidentResponseRequest');
    const rejected = await request(app).patch(editPath).auth(token(), { type: 'bearer' })
      .send({ ...editableInput(), status: RESPONSE_EDITABLE_STATUS });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
    expect(write).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(accepted.body);
  });

  it.each(RESPONSE_STATUSES.filter((status) => status !== RESPONSE_EDITABLE_STATUS))(
    'rejects %s even when an internal caller bypasses the service check', async (status) => {
      const { repository, original } = context({ status });
      expect(await repository.updateResidentResponseRequest(requestId, residentId, editableInput())).toBeNull();
      expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
    }
  );
});

describe('LDFEW-339 authenticated Resident ownership', () => {
  const otherResidentId = '507f1f77bcf86cd799439014';
  const otherRequestId = '507f1f77bcf86cd799439015';
  const notFoundError = { error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } };

  function twoResidents() {
    const current = context();
    const otherRequest = { ...current.original, id: otherRequestId, residentId: otherResidentId };
    current.repository.seedResponseRequest(otherRequest);
    return { ...current, otherRequest };
  }

  it.each([
    { actor: residentId, target: requestId, allowed: true },
    { actor: residentId, target: otherRequestId, allowed: false },
    { actor: otherResidentId, target: otherRequestId, allowed: true },
    { actor: otherResidentId, target: requestId, allowed: false }
  ])('enforces ownership for $actor editing $target', async ({ actor, target, allowed }) => {
    const { app, token, repository, original, otherRequest } = twoResidents();
    const lookup = vi.spyOn(repository, 'findResponseRequestById');
    const update = vi.spyOn(repository, 'updateResidentResponseRequest');
    const response = await request(app).patch(`${basePath}/mine/${target}`)
      .auth(token(actor), { type: 'bearer' }).send(editableInput());

    expect(lookup).toHaveBeenCalledExactlyOnceWith(target, actor);
    expect(response.status).toBe(allowed ? 200 : 404);
    if (allowed) {
      expect(update).toHaveBeenCalledExactlyOnceWith(target, actor, editableInput());
      expect(response.body.responseRequest).toEqual({
        ...(target === requestId ? original : otherRequest), ...editableInput(), updatedAt: expect.any(String)
      });
    } else {
      expect(response.body).toEqual(notFoundError);
      expect(update).not.toHaveBeenCalled();
    }
    // Verify both stored records, including the untouched neighbour and all
    // owner/lifecycle fields, rather than trusting the update response alone.
    for (const stored of [original, otherRequest]) {
      const expected = allowed && target === stored.id
        ? { ...stored, ...editableInput(), updatedAt: expect.any(String) } : stored;
      expect(await repository.findResponseRequestById(stored.id, stored.residentId)).toEqual(expected);
    }
  });

  it.each(['expired', 'wrong signing key', 'tampered subject'] as const)(
    'rejects %s credentials before any request lookup', async (kind) => {
      const { app, config, token, repository } = context();
      let credential: string;
      if (kind === 'tampered subject') {
        // A changed JWT subject is not trusted unless its signature also verifies.
        const parts = token(otherResidentId).split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ sub: residentId, role: 'RESIDENT' })).toString('base64url');
        credential = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      } else {
        credential = signAccessToken({
          ...config,
          ...(kind === 'expired' ? { jwtAccessExpiresIn: '-1s' } : { jwtAccessSecret: 'wrong-test-signing-key' })
        }, { id: residentId, role: 'RESIDENT' });
      }
      const lookup = vi.spyOn(repository, 'findResponseRequestById');
      const update = vi.spyOn(repository, 'updateResidentResponseRequest');
      const response = await request(app).patch(editPath).auth(credential, { type: 'bearer' }).send(editableInput());
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token.' } });
      expect(lookup).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  );

  it.each(USER_ROLES.filter((role) => role !== 'RESIDENT'))(
    'blocks %s before reading private request data, even with an injected Resident role', async (role) => {
      const { app, token, repository } = context();
      const lookup = vi.spyOn(repository, 'findResponseRequestById');
      const update = vi.spyOn(repository, 'updateResidentResponseRequest');
      const response = await request(app).patch(editPath).auth(token(residentId, role), { type: 'bearer' })
        .send({ ...editableInput(), role: 'RESIDENT', residentId });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'You are not allowed to perform this action.' } });
      expect(lookup).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  );

  it.each(['residentId', 'userId', 'ownerId', 'owner'])(
    'rejects injected %s in body and query without transferring or bypassing ownership', async (field) => {
      const { app, token, repository, original, otherRequest } = twoResidents();
      const update = vi.spyOn(repository, 'updateResidentResponseRequest');
      for (const target of [requestId, otherRequestId]) {
        for (const transport of ['body', 'query']) {
          const operation = request(app).patch(`${basePath}/mine/${target}`).auth(token(), { type: 'bearer' });
          const response = transport === 'body'
            ? await operation.send({ ...editableInput(), [field]: otherResidentId })
            : await operation.query({ [field]: otherResidentId }).send(editableInput());
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe('VALIDATION_ERROR');
          expect(JSON.stringify(response.body)).not.toContain(otherResidentId);
        }
      }
      expect(update).not.toHaveBeenCalled();
      expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
      expect(await repository.findResponseRequestById(otherRequestId, otherResidentId)).toEqual(otherRequest);
    }
  );

  it('does not treat identity headers as authentication or an ownership override', async () => {
    const { app, token, repository, original } = context();
    const update = vi.spyOn(repository, 'updateResidentResponseRequest');
    const unauthenticated = await request(app).patch(editPath)
      .set('X-User-Id', residentId).set('X-User-Role', 'RESIDENT').send(editableInput());
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } });
    const impersonation = await request(app).patch(editPath).auth(token(otherResidentId), { type: 'bearer' })
      .set('X-User-Id', residentId).send(editableInput());
    expect(impersonation.status).toBe(404);
    expect(impersonation.body).toEqual(notFoundError);
    expect(update).not.toHaveBeenCalled();
    expect(await repository.findResponseRequestById(requestId, residentId)).toEqual(original);
  });

  it.each([
    { actor: null, statusCode: 401 },
    { actor: undefined, statusCode: 401 },
    { actor: { id: '', role: 'RESIDENT' as const }, statusCode: 401 },
    { actor: { id: ' ', role: 'RESIDENT' as const }, statusCode: 401 },
    ...USER_ROLES.filter((role) => role !== 'RESIDENT').map((role) => ({ actor: { id: residentId, role }, statusCode: 403 }))
  ])('fails closed for invalid direct-service actor %#', async ({ actor, statusCode }) => {
    const { repository } = context();
    const lookup = vi.spyOn(repository, 'findResponseRequestById');
    const update = vi.spyOn(repository, 'updateResidentResponseRequest');
    await expect(new ResponseRequestService(repository).updateResidentResponseRequest(requestId, actor, editableInput()))
      .rejects.toMatchObject({ statusCode });
    expect(lookup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('scopes the MongoDB lookup by verified owner and never attempts a write on an ownership miss', async () => {
    const query = ResponseRequestModel.findOne();
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const lookup = vi.spyOn(ResponseRequestModel, 'findOne').mockReturnValueOnce(query);
    const update = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate');
    const service = new ResponseRequestService(new MongooseResponseRequestRepository());
    await expect(service.updateResidentResponseRequest(requestId, { id: otherResidentId, role: 'RESIDENT' }, editableInput()))
      .rejects.toMatchObject({ statusCode: 404, code: 'REQUEST_NOT_FOUND' });
    expect(lookup).toHaveBeenCalledExactlyOnceWith({ _id: requestId, residentId: otherResidentId });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Resident update MongoDB operation', () => {
  it.each([true, false])('uses an atomic owner/NEW predicate and explicit editable fields (notes: %s)', async (includeNotes) => {
    const { original } = context();
    const input = editableInput();
    if (!includeNotes) delete input.specialRequirements;
    const document = new ResponseRequestModel({ ...original, ...input, _id: requestId });
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(document);
    const update = vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);
    // Extra runtime fields must never reach $set, even if an internal caller bypasses HTTP validation.
    const result = await new MongooseResponseRequestRepository().updateResidentResponseRequest(requestId, residentId, {
      ...input, status: 'COMPLETED', residentId: responderId, createdAt: 'spoofed'
    } as UpdateResponseRequestRequest);
    expect(update).toHaveBeenCalledExactlyOnceWith(
      { _id: requestId, residentId, status: 'NEW' },
      { $set: input, ...(!includeNotes ? { $unset: { specialRequirements: 1 } } : {}) },
      { new: true, runValidators: true }
    );
    expect(result).toEqual(toSafeResponseRequest(document));
  });

  it('returns null when the conditional database update no longer matches', async () => {
    const query = ResponseRequestModel.findOneAndUpdate();
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(ResponseRequestModel, 'findOneAndUpdate').mockReturnValueOnce(query);
    expect(await new MongooseResponseRequestRepository().updateResidentResponseRequest(requestId, residentId, editableInput())).toBeNull();
  });
});
