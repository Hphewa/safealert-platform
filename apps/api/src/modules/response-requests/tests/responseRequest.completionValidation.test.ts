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
const progressPath = `/api/v1/response-requests/${requestId}/progress`;

function createInProgressRequest(overrides: Partial<SafeResponseRequest> = {}): SafeResponseRequest {
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
    contact: { name: 'Resident A', phoneNumber: '0775551234', email: 'resident@example.com' },
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
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'completion-validation-test-secret' };
  const repository = new InMemoryResponseRequestRepository();
  const initial = createInProgressRequest(overrides);
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

describe('LDFEW-353: Backend Completion Details Validation - REQUIRED FIELDS', () => {
  it('rejects completing a request when completion details are omitted entirely with 400 COMPLETION_DETAILS_REQUIRED', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('COMPLETION_DETAILS_REQUIRED');
    expect(response.body.error?.message).toContain('Completion details');
  });

  it('rejects completing a request when completionSummary is missing with 400 INVALID_COMPLETION_DETAILS', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'First aid and evacuation'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('INVALID_COMPLETION_DETAILS');
    expect(response.body.error?.message).toContain('Completion summary is required');
  });

  it('rejects completing a request when assistanceProvided is missing with 400 INVALID_COMPLETION_DETAILS', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        completionSummary: 'Patient stable in ambulance'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('INVALID_COMPLETION_DETAILS');
    expect(response.body.error?.message).toContain('Assistance provided is required');
  });
});

describe('LDFEW-353: Backend Completion Details Validation - WHITESPACE AND BOUNDARIES', () => {
  it('rejects empty or whitespace-only assistanceProvided with 400 VALIDATION_ERROR', async () => {
    const { app, token } = setupContext();

    for (const invalidValue of ['', '   ', '\t\n  ']) {
      const response = await request(app)
        .patch(progressPath)
        .auth(token(), { type: 'bearer' })
        .send({
          status: 'COMPLETED',
          assistanceProvided: invalidValue,
          completionSummary: 'Patient transferred safely'
        });

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(response.body.error?.message).toContain('Assistance provided must be at least 3 characters.');
    }
  });

  it('rejects empty or whitespace-only completionSummary with 400 VALIDATION_ERROR', async () => {
    const { app, token } = setupContext();

    for (const invalidValue of ['', '   ', '\t\n  ']) {
      const response = await request(app)
        .patch(progressPath)
        .auth(token(), { type: 'bearer' })
        .send({
          status: 'COMPLETED',
          assistanceProvided: 'Provided first aid and warm blanket',
          completionSummary: invalidValue
        });

      expect(response.status).toBe(400);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(response.body.error?.message).toContain('Completion summary must be at least 3 characters.');
    }
  });

  it('rejects assistanceProvided under 3 characters or over 1000 characters with 400', async () => {
    const { app, token } = setupContext();

    const shortResponse = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'ab',
        completionSummary: 'Outcome summary'
      });
    expect(shortResponse.status).toBe(400);
    expect(shortResponse.body.error?.code).toBe('VALIDATION_ERROR');

    const longResponse = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'a'.repeat(1001),
        completionSummary: 'Outcome summary'
      });
    expect(longResponse.status).toBe(400);
    expect(longResponse.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects completionSummary under 3 characters or over 1000 characters with 400', async () => {
    const { app, token } = setupContext();

    const shortResponse = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided first aid',
        completionSummary: 'ab'
      });
    expect(shortResponse.status).toBe(400);
    expect(shortResponse.body.error?.code).toBe('VALIDATION_ERROR');

    const longResponse = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided first aid',
        completionSummary: 'a'.repeat(1001)
      });
    expect(longResponse.status).toBe(400);
    expect(longResponse.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects responderRemarks over 1000 characters with 400', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided emergency care',
        completionSummary: 'Patient stable',
        responderRemarks: 'a'.repeat(1001)
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    expect(response.body.error?.message).toContain('Responder remarks must be at most 1000 characters.');
  });

  it('rejects non-string values for completion fields with 400', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 12345,
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

describe('LDFEW-353: Backend Completion Details Validation - STRICT SCHEMA', () => {
  it('rejects unpermitted extra or spoofed fields in request body with 400 VALIDATION_ERROR', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided first aid and transport',
        completionSummary: 'Patient hospitalized safely',
        assignedResponderId: 'spoofed-id',
        extraField: 'malicious'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('rejects completion fields when status is NOT COMPLETED with 400 VALIDATION_ERROR', async () => {
    const { app, token } = setupContext({ status: 'ASSIGNED' });

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'DISPATCHED',
        assistanceProvided: 'Pre-emptive completion notes'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    expect(response.body.error?.message).toContain('Assistance provided is only allowed when status is COMPLETED.');
  });
});

describe('LDFEW-353: Backend Completion Details - SUCCESS AND PERSISTENCE', () => {
  it('successfully completes request and trims strings before persistence', async () => {
    const { app, token, repository } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: '   Administered first aid and evacuated resident.   ',
        completionSummary: '   Immediate danger resolved; resident safe.   ',
        responderRemarks: '   Handover completed to medical team.   '
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.assistanceProvided).toBe('Administered first aid and evacuated resident.');
    expect(response.body.completionSummary).toBe('Immediate danger resolved; resident safe.');
    expect(response.body.responderRemarks).toBe('Handover completed to medical team.');
    expect(response.body.completedAt).toBeDefined();

    const persisted = await repository.findResponseRequestForProgress(requestId);
    expect(persisted?.assistanceProvided).toBe('Administered first aid and evacuated resident.');
    expect(persisted?.completionSummary).toBe('Immediate danger resolved; resident safe.');
    expect(persisted?.responderRemarks).toBe('Handover completed to medical team.');
  });

  it('allows optional responderRemarks to be omitted', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Provided blankets and food ration',
        completionSummary: 'Resident accommodated in temporary shelter'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.assistanceProvided).toBe('Provided blankets and food ration');
    expect(response.body.completionSummary).toBe('Resident accommodated in temporary shelter');
    expect(response.body.responderRemarks).toBeUndefined();
  });

  it('calls Mongoose update with trimmed completion details and runValidators', async () => {
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
      contact: { name: 'Resident', phoneNumber: '0775551234', email: 'resident@example.com' },
      description: 'Need help',
      assistanceProvided: 'First aid rendered',
      completionSummary: 'Resident stable',
      responderRemarks: 'Handed over',
      completedAt: new Date(),
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
        assistanceProvided: '  First aid rendered  ',
        completionSummary: '  Resident stable  ',
        responderRemarks: '  Handed over  '
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
          completionSummary: 'Resident stable',
          responderRemarks: 'Handed over'
        }
      },
      { new: true, runValidators: true }
    );
    expect(result).toBeDefined();
    expect(result?.status).toBe('COMPLETED');
  });
});

describe('LDFEW-353: Backend Completion Details - AUTHORIZATION & LIFECYCLE PRESERVATION', () => {
  it('rejects unauthenticated completion attempts with 401', async () => {
    const { app } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance',
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(401);
  });

  it('rejects non-responder roles with 403', async () => {
    const { app, token } = setupContext();
    const roles: UserRole[] = ['RESIDENT', 'DISASTER_OFFICER', 'COMMUNITY_VOLUNTEER'];

    for (const role of roles) {
      const response = await request(app)
        .patch(progressPath)
        .auth(token('user-1', role), { type: 'bearer' })
        .send({
          status: 'COMPLETED',
          assistanceProvided: 'Valid assistance',
          completionSummary: 'Valid summary'
        });

      expect(response.status).toBe(403);
    }
  });

  it('rejects completion from a different responder with 403 REQUEST_NOT_ASSIGNED', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch(progressPath)
      .auth(token(otherResponderId, 'EMERGENCY_RESPONDER'), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance',
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('REQUEST_NOT_ASSIGNED');
  });

  it.each(['NEW', 'ASSIGNED', 'DISPATCHED', 'ARRIVED', 'COMPLETED', 'CANCELLED'] as const)(
    'rejects invalid lifecycle transition %s -> COMPLETED with 409 INVALID_PROGRESS_TRANSITION',
    async (nonInProgressStatus) => {
      const { app, token } = setupContext({ status: nonInProgressStatus });

      const response = await request(app)
        .patch(progressPath)
        .auth(token(), { type: 'bearer' })
        .send({
          status: 'COMPLETED',
          assistanceProvided: 'Valid assistance',
          completionSummary: 'Valid summary'
        });

      expect(response.status).toBe(409);
      expect(response.body.error?.code).toBe('INVALID_PROGRESS_TRANSITION');
    }
  );

  it('rejects completing a nonexistent request with 404 REQUEST_NOT_FOUND', async () => {
    const { app, token } = setupContext();
    const missingId = '507f1f77bcf86cd799439099';

    const response = await request(app)
      .patch(`/api/v1/response-requests/${missingId}/progress`)
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance',
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(404);
    expect(response.body.error?.code).toBe('REQUEST_NOT_FOUND');
  });

  it('rejects completing with a malformed ObjectId with 400 INVALID_REQUEST_ID', async () => {
    const { app, token } = setupContext();

    const response = await request(app)
      .patch('/api/v1/response-requests/not-a-valid-id/progress')
      .auth(token(), { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Valid assistance',
        completionSummary: 'Valid summary'
      });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('INVALID_REQUEST_ID');
  });
});

describe('LDFEW-359: Persistence and Verification of Completed Request Across Roles', () => {
  it('persists completion details and server timestamp, allows resident tracking, and locks further responder updates', async () => {
    const { app, token, repository } = setupContext();
    const responderToken = token(assignedResponderId, 'EMERGENCY_RESPONDER');
    const residentToken = token(residentId, 'RESIDENT');

    const assistanceProvided = 'Relocated resident to designated safety zone and provided water.';
    const completionSummary = 'All persons secure; no immediate hazards remaining.';
    const responderRemarks = 'Shelter coordinator notified for continued supply monitoring.';

    // 1. Assigned responder completes the IN_PROGRESS request
    const completeResponse = await request(app)
      .patch(progressPath)
      .auth(responderToken, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided,
        completionSummary,
        responderRemarks
      });

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.status).toBe('COMPLETED');
    expect(completeResponse.body.assistanceProvided).toBe(assistanceProvided);
    expect(completeResponse.body.completionSummary).toBe(completionSummary);
    expect(completeResponse.body.responderRemarks).toBe(responderRemarks);
    expect(completeResponse.body.completedAt).toBeDefined();
    expect(new Date(completeResponse.body.completedAt).getTime()).not.toBeNaN();

    // 2. Verify backend repository directly reflects the persisted completion details
    const stored = await repository.findResponseRequestForProgress(requestId);
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.assistanceProvided).toBe(assistanceProvided);
    expect(stored?.completionSummary).toBe(completionSummary);
    expect(stored?.responderRemarks).toBe(responderRemarks);
    expect(stored?.completedAt).toBe(completeResponse.body.completedAt);

    // 3. Resident tracks the completed request via GET /mine/:requestId
    const residentResponse = await request(app)
      .get(`/api/v1/response-requests/mine/${requestId}`)
      .auth(residentToken, { type: 'bearer' });

    expect(residentResponse.status).toBe(200);
    expect(residentResponse.body.responseRequest.status).toBe('COMPLETED');
    expect(residentResponse.body.responseRequest.assistanceProvided).toBe(assistanceProvided);
    expect(residentResponse.body.responseRequest.completionSummary).toBe(completionSummary);
    expect(residentResponse.body.responseRequest.completedAt).toBe(completeResponse.body.completedAt);

    // 4. Further field updates on the COMPLETED request must be rejected (terminal lifecycle)
    const fieldUpdateResponse = await request(app)
      .patch(`/api/v1/response-requests/${requestId}/field-update`)
      .auth(responderToken, { type: 'bearer' })
      .send({ fieldNotes: 'Late operational note after completion.' });

    expect(fieldUpdateResponse.status).toBe(409);
    expect(fieldUpdateResponse.body.error?.code).toBe('INVALID_REQUEST_STATUS');

    // 5. Repeated completion attempts on the already-COMPLETED request must be rejected
    const repeatCompleteResponse = await request(app)
      .patch(progressPath)
      .auth(responderToken, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided,
        completionSummary
      });

    expect(repeatCompleteResponse.status).toBe(409);
    expect(repeatCompleteResponse.body.error?.code).toBe('INVALID_PROGRESS_TRANSITION');
  });
});
