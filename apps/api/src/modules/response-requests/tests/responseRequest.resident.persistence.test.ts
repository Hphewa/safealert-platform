import crypto from 'node:crypto';
import { RESPONSE_EDITABLE_STATUS, RESPONSE_PROGRESS_SEQUENCE, RESPONSE_STATUSES, type CreateResponseRequestRequest } from '@safealert/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { ResponseRequestModel } from '../models/responseRequest.model.js';
import { MongooseResponseRequestRepository } from '../repositories/mongooseResponseRequest.repository.js';

// Opt in with a dedicated test server, following the existing MongoDB persistence-test pattern.
// Never use MONGODB_URI: all writes and cleanup are restricted to this randomly named test database.
const mongodbUri = process.env.RESPONSE_REQUEST_TEST_MONGODB_URI;
const databaseName = `safealert_tracking_test_${crypto.randomBytes(12).toString('hex')}`;

describe.skipIf(!mongodbUri)('Resident emergency tracking MongoDB persistence', () => {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'resident-persistence-test-secret' };
  const residentId = new mongoose.Types.ObjectId().toString();
  const otherResidentId = new mongoose.Types.ObjectId().toString();
  const responderId = new mongoose.Types.ObjectId().toString();
  const residentToken = signAccessToken(config, { id: residentId, role: 'RESIDENT' });
  const otherToken = signAccessToken(config, { id: otherResidentId, role: 'RESIDENT' });
  const responderToken = signAccessToken(config, { id: responderId, role: 'EMERGENCY_RESPONDER' });
  const basePath = '/api/v1/response-requests';
  const input: CreateResponseRequestRequest = {
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 4, medicalNeeds: true, injuredPeople: 1,
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'LIMITED',
    contact: { name: 'Resident A', phoneNumber: '+94-77-555-1234' },
    description: 'Medical transport is needed.',
    specialRequirements: 'Wheelchair accessible transport.'
  };

  async function connect() {
    if (!mongodbUri) throw new Error('RESPONSE_REQUEST_TEST_MONGODB_URI is required.');
    await mongoose.connect(mongodbUri, {
      dbName: databaseName, serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false
    });
  }

  function freshApp() {
    return createApp({ config, authRepository: new InMemoryAuthRepository(),
      responseRequestRepository: new MongooseResponseRequestRepository() });
  }

  beforeAll(connect);
  beforeEach(async () => {
    // Isolate fixtures so owner-list assertions never depend on test execution order.
    if (mongoose.connection.name !== databaseName) throw new Error('Unexpected test database.');
    await ResponseRequestModel.deleteMany({});
  });
  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  it('persists Resident edits on the same document across reconnects and fresh authenticated reads', async () => {
    const app = freshApp();
    const created = await request(app).post(basePath).auth(residentToken, { type: 'bearer' }).send(input);
    expect(created.status).toBe(201);
    const id = created.body.responseRequest.id as string;
    const changed = { ...input, injuredPeople: 2, description: 'Two people now need assistance.', specialRequirements: '' };
    const updated = await request(app).patch(`${basePath}/mine/${id}`)
      .auth(residentToken, { type: 'bearer' }).send(changed);
    expect(updated.status).toBe(200);
    expect(updated.body.responseRequest).toMatchObject({
      id, residentId, status: 'NEW', injuredPeople: 2,
      description: changed.description, createdAt: created.body.responseRequest.createdAt
    });
    expect(updated.body.responseRequest.specialRequirements).toBeUndefined();

    await mongoose.disconnect();
    await connect();
    const freshToken = signAccessToken(config, { id: residentId, role: 'RESIDENT' });
    const retrieved = await request(freshApp()).get(`${basePath}/mine/${id}`).auth(freshToken, { type: 'bearer' });
    expect(retrieved.status).toBe(200);
    expect(retrieved.body).toEqual(updated.body);
    expect(await ResponseRequestModel.countDocuments({ residentId })).toBe(1);
    const stored = await ResponseRequestModel.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(stored?.injuredPeople).toBe(2);
    expect(stored?.specialRequirements).toBeUndefined();
  }, 30000);

  it('LDFEW-340: MongoDB rejects an edit when acceptance wins after the service read', async () => {
    const repository = new MongooseResponseRequestRepository();
    const app = createApp({ config, authRepository: new InMemoryAuthRepository(), responseRequestRepository: repository });
    const created = await repository.createResponseRequest({ ...input, residentId, status: RESPONSE_EDITABLE_STATUS });
    const filter = { _id: new mongoose.Types.ObjectId(created.id) };
    let acceptedDocument = await ResponseRequestModel.collection.findOne(filter);
    const write = repository.updateResidentResponseRequest.bind(repository);
    const update = vi.spyOn(repository, 'updateResidentResponseRequest').mockImplementationOnce(async (...args) => {
      // Keep the real MongoDB write, but force acceptance into the window after
      // the service approved NEW. This tests the database predicate, not a mock result.
      const accepted = await request(app).patch(`${basePath}/responder/requests/${created.id}/accept`)
        .auth(responderToken, { type: 'bearer' });
      expect(accepted.status).toBe(200);
      acceptedDocument = await ResponseRequestModel.collection.findOne(filter);
      return write(...args);
    });
    try {
      const rejected = await request(app).patch(`${basePath}/mine/${created.id}`)
        .auth(residentToken, { type: 'bearer' })
        .send({ ...input, injuredPeople: 2, description: 'This stale edit must not persist.', specialRequirements: '' });
      expect(rejected.status).toBe(409);
      expect(rejected.body.error.code).toBe('REQUEST_EDIT_CONFLICT');
      expect(update).toHaveBeenCalledTimes(1);
      expect(acceptedDocument?.status).toBe('ASSIGNED');
      expect(await ResponseRequestModel.collection.findOne(filter)).toEqual(acceptedDocument);
      const refreshed = await request(freshApp()).get(`${basePath}/mine/${created.id}`).auth(residentToken, { type: 'bearer' });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.responseRequest).toEqual({
        ...created, status: 'ASSIGNED', assignedResponderId: responderId,
        acceptedAt: acceptedDocument?.acceptedAt?.toISOString(), updatedAt: acceptedDocument?.updatedAt.toISOString()
      });
    } finally {
      update.mockRestore();
    }
  });

  it('LDFEW-340: the MongoDB predicate rejects every non-NEW state without the service guard', async () => {
    const repository = new MongooseResponseRequestRepository();
    for (const status of RESPONSE_STATUSES.filter((value) => value !== RESPONSE_EDITABLE_STATUS)) {
      const created = await repository.createResponseRequest({ ...input, residentId, status: RESPONSE_EDITABLE_STATUS });
      const filter = { _id: new mongoose.Types.ObjectId(created.id) };
      // Seed each state to exercise the storage boundary independently of the
      // service's early rejection; even updatedAt must remain unchanged.
      await ResponseRequestModel.updateOne(filter, { $set: { status } });
      const before = await ResponseRequestModel.collection.findOne(filter);
      expect(await repository.updateResidentResponseRequest(created.id, residentId, {
        ...input, injuredPeople: 2, specialRequirements: ''
      })).toBeNull();
      expect(await ResponseRequestModel.collection.findOne(filter)).toEqual(before);
    }
  });

  it('persists every responder update across disconnect/reconnect and fresh owner-scoped API reads', async () => {
    let app = freshApp();
    const created = await request(app).post(basePath).auth(residentToken, { type: 'bearer' }).send(input);
    expect(created.status).toBe(201);
    const id: unknown = created.body.responseRequest.id;
    if (typeof id !== 'string') throw new Error('Creation did not return a request ID.');
    const otherCreated = await request(app).post(basePath).auth(otherToken, { type: 'bearer' })
      .send({ ...input, description: 'Another resident request.' });
    expect(otherCreated.status).toBe(201);

    for (const status of ['NEW', ...RESPONSE_PROGRESS_SEQUENCE]) {
      if (status === 'ASSIGNED') {
        const accepted = await request(app).patch(`${basePath}/responder/requests/${id}/accept`)
          .auth(responderToken, { type: 'bearer' });
        expect(accepted.status).toBe(200);
      } else if (status !== 'NEW') {
        const progressed = await request(app).patch(`${basePath}/${id}/progress`)
          .auth(responderToken, { type: 'bearer' }).send({ status });
        expect(progressed.status).toBe(200);
      }

      // No repository, HTTP response or screen cache is used as the persistence assertion.
      await mongoose.disconnect();
      await connect();
      app = freshApp();
      const stored = await ResponseRequestModel.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      expect(stored?.status).toBe(status);
      const detail = await request(app).get(`${basePath}/mine/${id}`).auth(residentToken, { type: 'bearer' });
      const list = await request(app).get(`${basePath}/mine`).auth(residentToken, { type: 'bearer' });
      expect(detail.status).toBe(200);
      expect(list.status).toBe(200);
      expect(detail.body.responseRequest).toMatchObject({ id, residentId, status, specialRequirements: input.specialRequirements });
      expect(list.body).toEqual({ responseRequests: [detail.body.responseRequest] });
      const denied = await request(app).get(`${basePath}/mine/${id}`).auth(otherToken, { type: 'bearer' });
      expect(denied.status).toBe(404);
      expect(denied.body).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'Emergency request not found.' } });
    }
  }, 30000);

  it('preserves the cancelled MongoDB document and timestamp across reconnects and retries', async () => {
    let app = freshApp();
    const created = await request(app).post(basePath).auth(residentToken, { type: 'bearer' }).send(input);
    expect(created.status).toBe(201);
    const id: string = created.body.responseRequest.id;
    const filter = { _id: new mongoose.Types.ObjectId(id) };
    const before = await ResponseRequestModel.collection.findOne(filter);
    const cancelled = await request(app).patch(`${basePath}/${id}/cancel`).auth(residentToken, { type: 'bearer' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.responseRequest).toMatchObject({ id, residentId, status: 'CANCELLED' });

    await mongoose.disconnect();
    await connect();
    app = freshApp();
    const persisted = await ResponseRequestModel.collection.findOne(filter);
    expect(persisted).toEqual({
      ...before, status: 'CANCELLED', cancelledAt: expect.any(Date), updatedAt: expect.any(Date)
    });
    expect(persisted?.cancelledAt?.toISOString()).toBe(cancelled.body.responseRequest.cancelledAt);
    const detail = await request(app).get(`${basePath}/mine/${id}`).auth(residentToken, { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(cancelled.body);

    // Re-read history and active queues after reconnecting: cancellation retains the
    // record for its Resident while excluding it from responder work.
    const history = await request(app).get(`${basePath}/mine`).auth(residentToken, { type: 'bearer' });
    expect(history.status).toBe(200);
    expect(history.body.responseRequests).toEqual([detail.body.responseRequest]);
    for (const queue of ['pending', 'assigned']) {
      const active = await request(app).get(`${basePath}/responder/${queue}`).auth(responderToken, { type: 'bearer' });
      expect(active.status).toBe(200);
      expect(active.body).toEqual([]);
    }

    const retry = await request(app).patch(`${basePath}/${id}/cancel`).auth(residentToken, { type: 'bearer' });
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('INVALID_CANCELLATION_STATUS');
    expect(await ResponseRequestModel.collection.findOne(filter)).toEqual(persisted);
  }, 30000);

  it('atomically rechecks the owner and NEW status against concurrent MongoDB acceptance', async () => {
    const repository = new MongooseResponseRequestRepository();
    const created = await repository.createResponseRequest({ ...input, residentId, status: 'NEW' });
    await expect(repository.cancelResponseRequest(created.id, otherResidentId)).resolves.toBeNull();
    const [cancelled, accepted] = await Promise.all([
      repository.cancelResponseRequest(created.id, residentId),
      repository.acceptResponseRequest(created.id, responderId)
    ]);
    expect([cancelled, accepted].filter(Boolean)).toHaveLength(1);
    const stored = await repository.findResponseRequestById(created.id, residentId);
    expect(stored).toEqual(cancelled ?? accepted);
    await expect(repository.cancelResponseRequest(created.id, residentId)).resolves.toBeNull();
    expect(await repository.findResponseRequestById(created.id, residentId)).toEqual(stored);
  });

  it('rejects unauthorized and invalid API cancellations without changing the MongoDB document', async () => {
    const app = freshApp();
    const created = await request(app).post(basePath).auth(residentToken, { type: 'bearer' }).send(input);
    expect(created.status).toBe(201);
    const id: string = created.body.responseRequest.id;
    const filter = { _id: new mongoose.Types.ObjectId(id) };
    const before = await ResponseRequestModel.collection.findOne(filter);
    // Use verified authentication through the API rather than passing a trusted
    // owner directly to the repository and bypassing the security boundary.
    const denied = await request(app).patch(`${basePath}/${id}/cancel`).auth(otherToken, { type: 'bearer' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('REQUEST_NOT_OWNED');
    expect(JSON.stringify(denied.body)).not.toContain(residentId);
    const anonymous = await request(app).patch(`${basePath}/${id}/cancel`);
    expect(anonymous.status).toBe(401);
    const wrongRole = await request(app).patch(`${basePath}/${id}/cancel`).auth(responderToken, { type: 'bearer' });
    expect(wrongRole.status).toBe(403);
    const malformed = await request(app).patch(`${basePath}/not-an-id/cancel`).auth(residentToken, { type: 'bearer' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await request(app).patch(`${basePath}/${new mongoose.Types.ObjectId()}/cancel`)
      .auth(residentToken, { type: 'bearer' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REQUEST_NOT_FOUND');
    expect(await ResponseRequestModel.collection.findOne(filter)).toEqual(before);
    expect(await ResponseRequestModel.countDocuments()).toBe(1);
  });

  it('preserves every non-cancellable MongoDB lifecycle state when the owner calls the API', async () => {
    const app = freshApp();
    for (const status of RESPONSE_STATUSES.filter((value) => value !== 'NEW')) {
      const created = await request(app).post(basePath).auth(residentToken, { type: 'bearer' }).send(input);
      expect(created.status).toBe(201);
      const id: string = created.body.responseRequest.id;
      const filter = { _id: new mongoose.Types.ObjectId(id) };
      // Seed terminal/progressed fixtures without inventing a cancellation path
      // from an assigned request, which the business rules deliberately forbid.
      await ResponseRequestModel.updateOne(filter, { $set: { status } });
      const before = await ResponseRequestModel.collection.findOne(filter);
      const rejected = await request(app).patch(`${basePath}/${id}/cancel`).auth(residentToken, { type: 'bearer' });
      expect(rejected.status).toBe(409);
      expect(rejected.body.error.code).toBe('INVALID_CANCELLATION_STATUS');
      expect(await ResponseRequestModel.collection.findOne(filter)).toEqual(before);
    }
  });
});
