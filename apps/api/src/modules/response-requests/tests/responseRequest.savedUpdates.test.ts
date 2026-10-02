import type { SafeResponseRequest, UserRole } from '@safealert/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';

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
    contact: { name: 'Resident User', phoneNumber: '0775551234', email: 'resident@example.com' },
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
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'saved-updates-test-secret' };
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

describe('LDFEW-355: Backend API for Retrieving Previously Saved Responder Updates', () => {
  describe('GET /responder/requests/:requestId - Authentication and Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const { app } = setupContext();

      const response = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`);

      expect(response.status).toBe(401);
    });

    it('rejects non-responder roles with 403 FORBIDDEN', async () => {
      const { app, token } = setupContext();
      const residentToken = token(residentId, 'RESIDENT');

      const response = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${residentToken}`);

      expect(response.status).toBe(403);
    });

    it('rejects access from an unassigned responder with 403 REQUEST_NOT_ASSIGNED', async () => {
      const { app, token } = setupContext();
      const otherToken = token(otherResponderId, 'EMERGENCY_RESPONDER');

      const response = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error?.code).toBe('REQUEST_NOT_ASSIGNED');
    });

    it('rejects invalid ObjectId formats with 400 INVALID_REQUEST_ID', async () => {
      const { app, token } = setupContext();

      const response = await request(app)
        .get(`${basePath}/responder/requests/invalid-id-format`)
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(response.body.error?.message).toContain('A valid response request id is required');
    });

    it('returns 404 REQUEST_NOT_FOUND when request does not exist', async () => {
      const { app, token } = setupContext();
      const nonExistentId = '507f1f77bcf86cd799439099';

      const response = await request(app)
        .get(`${basePath}/responder/requests/${nonExistentId}`)
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(404);
      expect(response.body.error?.code).toBe('REQUEST_NOT_FOUND');
    });
  });

  describe('GET /responder/requests/:requestId - Retrieving Saved Field Updates and Timestamps', () => {
    it('returns 200 with saved fieldNotes and fieldUpdatedAt for assigned responder', async () => {
      const savedTime = '2026-09-24T10:25:00.000Z';
      const notes = 'Access road cleared; triage area established in school courtyard.';
      const { app, token } = setupContext({
        fieldNotes: notes,
        fieldUpdatedAt: savedTime
      });

      const response = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(requestId);
      expect(response.body.assignedResponderId).toBe(assignedResponderId);
      expect(response.body.fieldNotes).toBe(notes);
      expect(response.body.fieldUpdatedAt).toBe(savedTime);
    });

    it('returns 200 with saved completion details and completedAt for completed request', async () => {
      const completedTime = '2026-09-24T10:45:00.000Z';
      const assistance = 'Relocated resident to shelter and provided first aid.';
      const summary = 'Immediate threat resolved; resident safe and stable.';
      const remarks = 'Follow-up check recommended within 24 hours.';
      const notes = 'Initial triage note.';
      const fieldTime = '2026-09-24T10:20:00.000Z';

      const { app, token } = setupContext({
        status: 'COMPLETED',
        completedAt: completedTime,
        assistanceProvided: assistance,
        completionSummary: summary,
        responderRemarks: remarks,
        fieldNotes: notes,
        fieldUpdatedAt: fieldTime
      });

      const response = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.completedAt).toBe(completedTime);
      expect(response.body.assistanceProvided).toBe(assistance);
      expect(response.body.completionSummary).toBe(summary);
      expect(response.body.responderRemarks).toBe(remarks);
      expect(response.body.fieldNotes).toBe(notes);
      expect(response.body.fieldUpdatedAt).toBe(fieldTime);
    });
  });

  describe('Persistence Across Refresh and Reload Cycles', () => {
    it('persists field update and server timestamp across subsequent read requests', async () => {
      const fixedTime = new Date('2026-09-24T10:30:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedTime);

      const { app, token } = setupContext();
      const responderToken = token();

      // Step 1: Save field update via PATCH
      const patchResponse = await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({ fieldNotes: 'Delivered sterile water and first aid kits.' });

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body.fieldNotes).toBe('Delivered sterile water and first aid kits.');
      expect(patchResponse.body.fieldUpdatedAt).toBe(fixedTime.toISOString());

      // Step 2: Simulate screen reload / refresh by reading fresh from GET endpoint
      const getResponse = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${responderToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.fieldNotes).toBe('Delivered sterile water and first aid kits.');
      expect(getResponse.body.fieldUpdatedAt).toBe(fixedTime.toISOString());
    });

    it('persists subsequent field updates and advances server timestamp across reloads', async () => {
      const initialTime = new Date('2026-09-24T10:20:00.000Z');
      const secondTime = new Date('2026-09-24T10:35:00.000Z');
      vi.useFakeTimers();

      const { app, token } = setupContext();
      const responderToken = token();

      // First update
      vi.setSystemTime(initialTime);
      await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({ fieldNotes: 'First update at entrance.' });

      // Second update
      vi.setSystemTime(secondTime);
      await request(app)
        .patch(`${basePath}/${requestId}/field-update`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({ fieldNotes: 'Second update: secondary building secure.' });

      // Reload
      const reloadResponse = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${responderToken}`);

      expect(reloadResponse.status).toBe(200);
      expect(reloadResponse.body.fieldNotes).toBe('Second update: secondary building secure.');
      expect(reloadResponse.body.fieldUpdatedAt).toBe(secondTime.toISOString());
    });

    it('persists final completion details and server completedAt across reloads', async () => {
      const completeTime = new Date('2026-09-24T10:50:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(completeTime);

      const { app, token } = setupContext();
      const responderToken = token();

      // Complete request via PATCH /progress
      const completeResponse = await request(app)
        .patch(`${basePath}/${requestId}/progress`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({
          status: 'COMPLETED',
          assistanceProvided: 'Full evacuation and medical stabilization.',
          completionSummary: 'Patient transferred safely to regional hospital.',
          responderRemarks: 'Case closed with EMS handover.'
        });

      expect(completeResponse.status).toBe(200);
      expect(completeResponse.body.status).toBe('COMPLETED');
      expect(completeResponse.body.completedAt).toBe(completeTime.toISOString());

      // Reload
      const reloadResponse = await request(app)
        .get(`${basePath}/responder/requests/${requestId}`)
        .set('Authorization', `Bearer ${responderToken}`);

      expect(reloadResponse.status).toBe(200);
      expect(reloadResponse.body.status).toBe('COMPLETED');
      expect(reloadResponse.body.completedAt).toBe(completeTime.toISOString());
      expect(reloadResponse.body.assistanceProvided).toBe('Full evacuation and medical stabilization.');
      expect(reloadResponse.body.completionSummary).toBe('Patient transferred safely to regional hospital.');
      expect(reloadResponse.body.responderRemarks).toBe('Case closed with EMS handover.');
    });
  });
});
