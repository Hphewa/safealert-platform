import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../../services/api/client';
import { updateResponderRequestProgress } from './api/responderProgressApi';
import {
  canManageResponderProgress,
  getResponderProgressAction,
  progressStatusLabel,
  responderProgressFeedback
} from './progressUi';
import {
  clearResponderRequestCache,
  getCachedResponderRequest,
  replaceResponderRequestCache,
  updateCachedResponderRequest
} from './requestDetailsCache';

const responder: SafeUser = {
  id: 'responder-a', name: 'Responder A', email: 'responder@example.com', role: 'EMERGENCY_RESPONDER'
};
const assignedRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011',
  residentId: 'resident-1',
  assignedResponderId: responder.id,
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 1,
  medicalNeeds: true,
  injuredPeople: 1,
  vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
  description: 'Medical assistance needed.',
  acceptedAt: '2026-09-24T10:00:00.000Z',
  createdAt: '2026-09-24T09:59:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearResponderRequestCache();
});

describe('responder progress controls', () => {
  it.each([
    ['ASSIGNED', 'DISPATCHED', 'Start Dispatch'],
    ['DISPATCHED', 'ARRIVED', 'Mark as Arrived'],
    ['ARRIVED', 'IN_PROGRESS', 'Start Assistance'],
    ['IN_PROGRESS', 'COMPLETED', 'Complete Request']
  ] as const)('offers only %s -> %s with the label %s', (status, nextStatus, label) => {
    expect(getResponderProgressAction({ ...assignedRequest, status }, responder)).toEqual({ nextStatus, label });
  });

  it('keeps COMPLETED visible without offering a further action', () => {
    const completed = { ...assignedRequest, status: 'COMPLETED' as const };
    expect(canManageResponderProgress(completed, responder)).toBe(true);
    expect(getResponderProgressAction(completed, responder)).toBeNull();
    expect(progressStatusLabel(completed.status)).toBe('Completed');
  });

  it('leaves NEW requests to the existing accept/decline flow', () => {
    const pending = { ...assignedRequest, status: 'NEW' as const };
    expect(canManageResponderProgress(pending, responder)).toBe(false);
    expect(getResponderProgressAction(pending, responder)).toBeNull();
  });

  it.each(['', ' ', 'invalid-id'])('does not offer a progress action for invalid ID %s', (id) => {
    expect(getResponderProgressAction({ ...assignedRequest, id }, responder)).toBeNull();
  });

  it.each(['INVALID', 'constructor', undefined])('rejects unexpected cached status %s', (status) => {
    const invalid = { ...assignedRequest, status } as SafeResponseRequest;
    expect(getResponderProgressAction(invalid, responder)).toBeNull();
  });

  it.each([
    null,
    { ...responder, id: 'responder-b' },
    { ...responder, role: 'RESIDENT' as const },
    { ...responder, role: 'COMMUNITY_VOLUNTEER' as const },
    { ...responder, role: 'DISASTER_OFFICER' as const }
  ])('does not offer progress to an unassigned or unauthorized user: %j', (user) => {
    expect(getResponderProgressAction(assignedRequest, user)).toBeNull();
  });

  it('does not offer progress without a request or assignment', () => {
    expect(getResponderProgressAction(null, responder)).toBeNull();
    expect(getResponderProgressAction({ ...assignedRequest, assignedResponderId: undefined }, responder)).toBeNull();
  });

  it('uses readable status labels', () => {
    expect(progressStatusLabel('IN_PROGRESS')).toBe('In progress');
    expect(progressStatusLabel('DISPATCHED')).toBe('Dispatched');
  });

  it('updates the cached status and next action from API success without replacing other requests', async () => {
    const otherRequest = { ...assignedRequest, id: '507f1f77bcf86cd799439012' };
    replaceResponderRequestCache([assignedRequest, otherRequest]);
    const updated = {
      ...assignedRequest,
      status: 'DISPATCHED' as const,
      dispatchedAt: '2026-09-24T10:01:00.000Z',
      updatedAt: '2026-09-24T10:01:00.000Z'
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(updated))));

    const result = await updateResponderRequestProgress(assignedRequest.id, 'DISPATCHED', 'token');
    updateCachedResponderRequest(result);

    expect(getCachedResponderRequest(assignedRequest.id)).toEqual(updated);
    expect(getResponderProgressAction(getCachedResponderRequest(assignedRequest.id), responder)).toEqual({
      nextStatus: 'ARRIVED', label: 'Mark as Arrived'
    });
    expect(getCachedResponderRequest(otherRequest.id)).toEqual(otherRequest);
  });

  it('keeps the last confirmed status after API failure and provides friendly feedback', async () => {
    replaceResponderRequestCache([assignedRequest]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Internal host details')));
    let feedback = '';
    try {
      const updated = await updateResponderRequestProgress(assignedRequest.id, 'DISPATCHED', 'token');
      updateCachedResponderRequest(updated);
    } catch (error) {
      feedback = responderProgressFeedback(error);
    }

    expect(feedback).toContain('Check your connection');
    expect(feedback).not.toContain('Internal host');
    expect(getCachedResponderRequest(assignedRequest.id)).toEqual(assignedRequest);
  });

  it.each([401, 403, 404, 409, 500])('sanitizes HTTP %s feedback instead of displaying raw API errors', (status) => {
    const message = responderProgressFeedback(new ApiClientError(status, 'API_ERROR', 'Raw server details'));
    expect(message).not.toContain('Raw server details');
    expect(message.length).toBeGreaterThan(0);
  });

  it('uses safe fallback feedback for unexpected errors', () => {
    expect(responderProgressFeedback(new Error('Raw exception'))).toBe(
      'Unable to confirm request progress. Please check your connection and try again.'
    );
  });
});
