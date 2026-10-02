import {
  type CreateResponseRequestRequest,
  type SafeResponseRequest,
  type UserRole
} from '@safealert/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../../auth/repositories/inMemoryAuth.repository.js';
import { signAccessToken } from '../../auth/services/token.service.js';
import { InMemoryResponseRequestRepository } from '../repositories/inMemoryResponseRequest.repository.js';

const basePath = '/api/v1/response-requests';

function validCreationPayload(): CreateResponseRequestRequest {
  return {
    assistanceType: 'MEDICAL_ASSISTANCE',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    affectedPeople: 3,
    medicalNeeds: true,
    injuredPeople: 1,
    vulnerablePeople: { children: 1, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
    roadAccessibility: 'ACCESSIBLE',
    contact: { name: 'Resident Alice', phoneNumber: '0775551234', email: 'alice@example.com' },
    description: 'Emergency medical aid needed due to floodwaters.'
  };
}

async function createTestContext() {
  const config = { ...loadConfig(), nodeEnv: 'test', jwtAccessSecret: 'cross-flow-sync-test-secret' };
  const authRepository = new InMemoryAuthRepository();
  const responseRequestRepository = new InMemoryResponseRequestRepository();
  const app = createApp({ config, authRepository, responseRequestRepository });

  const createActor = async (role: UserRole, email: string) => {
    const user = await authRepository.createUser({ name: role, email, passwordHash: 'unused', role });
    return { id: user.id, email, role, token: signAccessToken(config, user) };
  };

  const residentAlice = await createActor('RESIDENT', 'alice@example.com');
  const residentBob = await createActor('RESIDENT', 'bob@example.com');
  const responderCarol = await createActor('EMERGENCY_RESPONDER', 'carol@example.com');
  const responderDave = await createActor('EMERGENCY_RESPONDER', 'dave@example.com');
  const volunteer = await createActor('COMMUNITY_VOLUNTEER', 'volunteer@example.com');

  return {
    app,
    config,
    authRepository,
    responseRequestRepository,
    createActor,
    residentAlice,
    residentBob,
    responderCarol,
    responderDave,
    volunteer
  };
}

afterEach(() => vi.restoreAllMocks());

describe('LDFEW-392: Resident / Responder Status Synchronization', () => {
  it('synchronizes the complete lifecycle from Resident creation through Responder completion', async () => {
    const { app, residentAlice, responderCarol } = await createTestContext();

    // 1. Resident submits request -> status NEW
    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    expect(createRes.status).toBe(201);
    const created = createRes.body.responseRequest as SafeResponseRequest;
    expect(created.status).toBe('NEW');
    expect(created.residentId).toBe(residentAlice.id);

    // 2. Responder checks Pending queue -> sees newly submitted request
    const pendingRes = await request(app)
      .get(`${basePath}/responder/pending`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body).toHaveLength(1);
    expect(pendingRes.body[0].id).toBe(created.id);
    expect(pendingRes.body[0].status).toBe('NEW');

    // 3. Responder accepts request -> status becomes ASSIGNED
    const acceptRes = await request(app)
      .patch(`${basePath}/responder/requests/${created.id}/accept`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('ASSIGNED');
    expect(acceptRes.body.assignedResponderId).toBe(responderCarol.id);
    expect(acceptRes.body.acceptedAt).toBeDefined();

    // 4. Pending queue is now empty; Assigned queue now has the request
    const pendingAfterAccept = await request(app)
      .get(`${basePath}/responder/pending`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(pendingAfterAccept.body).toHaveLength(0);

    const assignedRes = await request(app)
      .get(`${basePath}/responder/assigned`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(assignedRes.body).toHaveLength(1);
    expect(assignedRes.body[0].id).toBe(created.id);
    expect(assignedRes.body[0].status).toBe('ASSIGNED');

    // 5. Resident tracking reflects ASSIGNED status and assigned responder ID
    const residentTrackingAfterAccept = await request(app)
      .get(`${basePath}/mine/${created.id}`)
      .auth(residentAlice.token, { type: 'bearer' });
    expect(residentTrackingAfterAccept.status).toBe(200);
    expect(residentTrackingAfterAccept.body.responseRequest.status).toBe('ASSIGNED');
    expect(residentTrackingAfterAccept.body.responseRequest.assignedResponderId).toBe(responderCarol.id);

    // 6. Progressive lifecycle dispatch: DISPATCHED -> ARRIVED -> IN_PROGRESS
    const intermediateStages: Array<{ status: 'DISPATCHED' | 'ARRIVED' | 'IN_PROGRESS'; timestampField: string }> = [
      { status: 'DISPATCHED', timestampField: 'dispatchedAt' },
      { status: 'ARRIVED', timestampField: 'arrivedAt' },
      { status: 'IN_PROGRESS', timestampField: 'inProgressAt' }
    ];

    for (const stage of intermediateStages) {
      const progressRes = await request(app)
        .patch(`${basePath}/${created.id}/progress`)
        .auth(responderCarol.token, { type: 'bearer' })
        .send({ status: stage.status });
      expect(progressRes.status).toBe(200);
      expect(progressRes.body.status).toBe(stage.status);
      expect(progressRes.body[stage.timestampField]).toBeDefined();

      // Resident tracking immediately synchronizes with the updated stage
      const tracking = await request(app)
        .get(`${basePath}/mine/${created.id}`)
        .auth(residentAlice.token, { type: 'bearer' });
      expect(tracking.status).toBe(200);
      expect(tracking.body.responseRequest.status).toBe(stage.status);
      expect(tracking.body.responseRequest[stage.timestampField]).toBeDefined();
    }

    // 7. Responder records operational field update
    const fieldUpdateRes = await request(app)
      .patch(`${basePath}/${created.id}/field-update`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ fieldNotes: 'Access road partially flooded. Proceeding with high-clearance truck.' });
    expect(fieldUpdateRes.status).toBe(200);
    expect(fieldUpdateRes.body.fieldNotes).toBe('Access road partially flooded. Proceeding with high-clearance truck.');
    expect(fieldUpdateRes.body.fieldUpdatedAt).toBeDefined();

    // 8. Responder completes request with required completion details
    const completeRes = await request(app)
      .patch(`${basePath}/${created.id}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'First aid applied and family evacuated safely.',
        completionSummary: 'Medical evacuation resolved successfully.',
        responderRemarks: 'Internal note: medical kit restock needed.'
      });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('COMPLETED');
    expect(completeRes.body.completedAt).toBeDefined();
    expect(completeRes.body.assistanceProvided).toBe('First aid applied and family evacuated safely.');
    expect(completeRes.body.completionSummary).toBe('Medical evacuation resolved successfully.');

    // 9. Completed request leaves Responder active assigned queue
    const assignedAfterComplete = await request(app)
      .get(`${basePath}/responder/assigned`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(assignedAfterComplete.body).toHaveLength(0);

    // 10. Resident tracking shows COMPLETED status and completion details
    const residentTrackingFinal = await request(app)
      .get(`${basePath}/mine/${created.id}`)
      .auth(residentAlice.token, { type: 'bearer' });
    expect(residentTrackingFinal.status).toBe(200);
    expect(residentTrackingFinal.body.responseRequest.status).toBe('COMPLETED');
    expect(residentTrackingFinal.body.responseRequest.completedAt).toBeDefined();
    expect(residentTrackingFinal.body.responseRequest.assistanceProvided).toBe('First aid applied and family evacuated safely.');
    expect(residentTrackingFinal.body.responseRequest.completionSummary).toBe('Medical evacuation resolved successfully.');
  });

  it('removes request from Responder Pending queue when Resident cancels while in NEW status', async () => {
    const { app, residentAlice, responderCarol } = await createTestContext();

    // Resident submits request
    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    const requestId = createRes.body.responseRequest.id;

    // Verify it is visible in Pending queue
    const pendingBefore = await request(app)
      .get(`${basePath}/responder/pending`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(pendingBefore.body.some((req: SafeResponseRequest) => req.id === requestId)).toBe(true);

    // Resident cancels the request
    const cancelRes = await request(app)
      .patch(`${basePath}/${requestId}/cancel`)
      .auth(residentAlice.token, { type: 'bearer' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.responseRequest.status).toBe('CANCELLED');

    // Responder Pending queue no longer contains the cancelled request
    const pendingAfter = await request(app)
      .get(`${basePath}/responder/pending`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(pendingAfter.body.some((req: SafeResponseRequest) => req.id === requestId)).toBe(false);

    // Responder cannot accept or decline a cancelled request
    const acceptCancelled = await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(acceptCancelled.status).toBe(409);
    expect(acceptCancelled.body.error.code).toBe('REQUEST_NOT_AVAILABLE');

    const declineCancelled = await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/decline`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(declineCancelled.status).toBe(409);
    expect(declineCancelled.body.error.code).toBe('REQUEST_NOT_AVAILABLE');
  });

  it('prevents Resident cancellation or editing once Responder has accepted the request', async () => {
    const { app, residentAlice, responderCarol } = await createTestContext();

    // Resident creates request
    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    const requestId = createRes.body.responseRequest.id;

    // Responder accepts request
    const acceptRes = await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responderCarol.token, { type: 'bearer' });
    expect(acceptRes.status).toBe(200);

    // Resident tries to cancel -> 409 INVALID_CANCELLATION_STATUS
    const cancelRes = await request(app)
      .patch(`${basePath}/${requestId}/cancel`)
      .auth(residentAlice.token, { type: 'bearer' });
    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.code).toBe('INVALID_CANCELLATION_STATUS');

    // Resident tries to edit -> 409 INVALID_EDIT_STATUS
    const editRes = await request(app)
      .patch(`${basePath}/mine/${requestId}`)
      .auth(residentAlice.token, { type: 'bearer' })
      .send({ ...validCreationPayload(), affectedPeople: 5 });
    expect(editRes.status).toBe(409);
    expect(editRes.body.error.code).toBe('INVALID_EDIT_STATUS');
  });
});

describe('LDFEW-400: Authorization and Invalid Actions', () => {
  it('enforces strict role-based access control across all response-request routes', async () => {
    const { app, residentAlice, responderCarol, volunteer } = await createTestContext();

    // Resident cannot access responder endpoints
    const responderEndpoints = [
      { method: 'get', path: `${basePath}/responder/pending` },
      { method: 'get', path: `${basePath}/responder/assigned` },
      { method: 'get', path: `${basePath}/responder/requests/507f1f77bcf86cd799439011` },
      { method: 'patch', path: `${basePath}/responder/requests/507f1f77bcf86cd799439011/accept` },
      { method: 'patch', path: `${basePath}/responder/requests/507f1f77bcf86cd799439011/decline` },
      { method: 'patch', path: `${basePath}/507f1f77bcf86cd799439011/progress` },
      { method: 'patch', path: `${basePath}/507f1f77bcf86cd799439011/field-update` }
    ] as const;

    for (const ep of responderEndpoints) {
      const agent = ep.method === 'get' ? request(app).get(ep.path) : request(app).patch(ep.path);
      const res = await agent.auth(residentAlice.token, { type: 'bearer' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }

    // Responder cannot access resident endpoints
    const residentEndpoints = [
      { method: 'post', path: basePath, send: validCreationPayload() },
      { method: 'get', path: `${basePath}/mine` },
      { method: 'get', path: `${basePath}/mine/507f1f77bcf86cd799439011` },
      { method: 'patch', path: `${basePath}/mine/507f1f77bcf86cd799439011`, send: { affectedPeople: 2 } },
      { method: 'patch', path: `${basePath}/507f1f77bcf86cd799439011/cancel` }
    ] as const;

    for (const ep of residentEndpoints) {
      const agent =
        ep.method === 'post'
          ? request(app).post(ep.path)
          : ep.method === 'get'
            ? request(app).get(ep.path)
            : request(app).patch(ep.path);
      agent.auth(responderCarol.token, { type: 'bearer' });
      if ('send' in ep && ep.send) agent.send(ep.send);
      const res = await agent;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }

    // Unrelated role (VOLUNTEER) is rejected on both resident and responder endpoints
    const volResident = await request(app).get(`${basePath}/mine`).auth(volunteer.token, { type: 'bearer' });
    expect(volResident.status).toBe(403);

    const volResponder = await request(app).get(`${basePath}/responder/pending`).auth(volunteer.token, { type: 'bearer' });
    expect(volResponder.status).toBe(403);

    // Unauthenticated requests are rejected with 401
    const unauth = await request(app).get(`${basePath}/mine`);
    expect(unauth.status).toBe(401);
  });

  it('enforces ownership boundary rules: Resident B cannot view, edit, or cancel Resident A request', async () => {
    const { app, residentAlice, residentBob } = await createTestContext();

    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    const requestId = createRes.body.responseRequest.id;

    // Resident B cannot view Resident A's request -> 404 REQUEST_NOT_FOUND (opaque)
    const viewRes = await request(app)
      .get(`${basePath}/mine/${requestId}`)
      .auth(residentBob.token, { type: 'bearer' });
    expect(viewRes.status).toBe(404);
    expect(viewRes.body.error.code).toBe('REQUEST_NOT_FOUND');

    // Resident B cannot edit Resident A's request -> 404 REQUEST_NOT_FOUND
    const editRes = await request(app)
      .patch(`${basePath}/mine/${requestId}`)
      .auth(residentBob.token, { type: 'bearer' })
      .send({ ...validCreationPayload(), affectedPeople: 6 });
    expect(editRes.status).toBe(404);
    expect(editRes.body.error.code).toBe('REQUEST_NOT_FOUND');

    // Resident B cannot cancel Resident A's request -> 403 REQUEST_NOT_OWNED
    const cancelRes = await request(app)
      .patch(`${basePath}/${requestId}/cancel`)
      .auth(residentBob.token, { type: 'bearer' });
    expect(cancelRes.status).toBe(403);
    expect(cancelRes.body.error.code).toBe('REQUEST_NOT_OWNED');
  });

  it('enforces responder assignment boundary: unassigned Responder Dave cannot manage Responder Carol assigned request', async () => {
    const { app, residentAlice, responderCarol, responderDave } = await createTestContext();

    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    const requestId = createRes.body.responseRequest.id;

    // Responder Carol accepts the request
    await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responderCarol.token, { type: 'bearer' });

    // Responder Dave tries to view the request details by ID -> 403 REQUEST_NOT_ASSIGNED
    const daveView = await request(app)
      .get(`${basePath}/responder/requests/${requestId}`)
      .auth(responderDave.token, { type: 'bearer' });
    expect(daveView.status).toBe(403);
    expect(daveView.body.error.code).toBe('REQUEST_NOT_ASSIGNED');

    // Responder Dave tries to update progress -> 403 REQUEST_NOT_ASSIGNED
    const daveProgress = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderDave.token, { type: 'bearer' })
      .send({ status: 'DISPATCHED' });
    expect(daveProgress.status).toBe(403);
    expect(daveProgress.body.error.code).toBe('REQUEST_NOT_ASSIGNED');

    // Responder Dave tries to record field update -> 403 REQUEST_NOT_ASSIGNED
    const daveField = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(responderDave.token, { type: 'bearer' })
      .send({ fieldNotes: 'Unauthorized note attempt' });
    expect(daveField.status).toBe(403);
    expect(daveField.body.error.code).toBe('REQUEST_NOT_ASSIGNED');
  });

  it('rejects invalid lifecycle transitions and validates completion details', async () => {
    const { app, residentAlice, responderCarol } = await createTestContext();

    const createRes = await request(app)
      .post(basePath)
      .auth(residentAlice.token, { type: 'bearer' })
      .send(validCreationPayload());
    const requestId = createRes.body.responseRequest.id;

    // Cannot progress a NEW request without accepting it first
    const progressNew = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'DISPATCHED' });
    expect(progressNew.status).toBe(403);

    // Cannot record field updates on a NEW request
    const fieldNew = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ fieldNotes: 'Some notes' });
    expect(fieldNew.status).toBe(409);
    expect(fieldNew.body.error.code).toBe('INVALID_REQUEST_STATUS');

    // Carol accepts
    await request(app)
      .patch(`${basePath}/responder/requests/${requestId}/accept`)
      .auth(responderCarol.token, { type: 'bearer' });

    // Cannot jump from ASSIGNED directly to COMPLETED (skipping DISPATCHED, ARRIVED, IN_PROGRESS)
    const jumpToCompleted = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Jumped ahead',
        completionSummary: 'Resolved prematurely'
      });
    expect(jumpToCompleted.status).toBe(409);
    expect(jumpToCompleted.body.error.code).toBe('INVALID_PROGRESS_TRANSITION');

    // Progress to DISPATCHED
    await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'DISPATCHED' });

    // Progress to ARRIVED
    await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'ARRIVED' });

    // Cannot transition backwards from ARRIVED to DISPATCHED
    const backwards = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'DISPATCHED' });
    expect(backwards.status).toBe(409);
    expect(backwards.body.error.code).toBe('INVALID_PROGRESS_TRANSITION');

    // Progress to IN_PROGRESS
    await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'IN_PROGRESS' });

    // Cannot complete without required completion details
    const completeWithoutDetails = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ status: 'COMPLETED' });
    expect(completeWithoutDetails.status).toBe(400);
    expect(completeWithoutDetails.body.error.code).toBe('COMPLETION_DETAILS_REQUIRED');

    // Cannot complete with empty/too short assistance provided
    const completeWithInvalidDetails = await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'a',
        completionSummary: 'Proper completion summary here'
      });
    expect(completeWithInvalidDetails.status).toBe(400);
    expect(completeWithInvalidDetails.body.error.code).toBe('VALIDATION_ERROR');

    // Complete successfully
    await request(app)
      .patch(`${basePath}/${requestId}/progress`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({
        status: 'COMPLETED',
        assistanceProvided: 'Medical assistance completed successfully',
        completionSummary: 'Patient stable and in shelter'
      });

    // Cannot record field updates on a COMPLETED request
    const fieldCompleted = await request(app)
      .patch(`${basePath}/${requestId}/field-update`)
      .auth(responderCarol.token, { type: 'bearer' })
      .send({ fieldNotes: 'Late note' });
    expect(fieldCompleted.status).toBe(409);
    expect(fieldCompleted.body.error.code).toBe('INVALID_REQUEST_STATUS');
  });
});
