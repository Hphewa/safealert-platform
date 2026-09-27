import crypto from 'node:crypto';
import { RESPONSE_STATUSES, type CreateResponseRequestRequest } from '@safealert/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  afterAll(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
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

    for (const status of RESPONSE_STATUSES) {
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
});
