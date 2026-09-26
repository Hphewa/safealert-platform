import type { SafeResponseRequest } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import { getResponderQueueCounts, getVisibleResponderRequests } from './queueState';

const request = (id: string, status: SafeResponseRequest['status']): SafeResponseRequest => ({
  id,
  residentId: 'resident-1',
  assistanceType: 'FLOOD_ASSISTANCE',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  affectedPeople: 1,
  medicalNeeds: false,
  injuredPeople: 0,
  vulnerablePeople: {
    children: 0,
    elderlyPeople: 0,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  roadAccessibility: 'ACCESSIBLE',
  contact: {
    name: 'Resident User',
    phoneNumber: '+94-77-555-1234'
  },
  description: 'Assistance is needed at the reported location.',
  status,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
});

describe('responder queue state', () => {
  it('keeps pending and assigned requests in separate tab lists', () => {
    const queueState = {
      pending: [request('pending-1', 'NEW')],
      assigned: [request('assigned-1', 'ASSIGNED')]
    };

    expect(getVisibleResponderRequests(queueState, 'PENDING').map(({ id }) => id)).toEqual([
      'pending-1'
    ]);
    expect(getVisibleResponderRequests(queueState, 'ASSIGNED').map(({ id }) => id)).toEqual([
      'assigned-1'
    ]);
  });

  it('derives tab counts from the current queue data', () => {
    const counts = getResponderQueueCounts({
      pending: [request('pending-1', 'NEW'), request('pending-2', 'NEW')],
      assigned: [request('assigned-1', 'ASSIGNED')]
    });

    expect(counts).toEqual({ PENDING: 2, ASSIGNED: 1 });
  });

  it('returns empty lists for empty queues', () => {
    const queueState = { pending: [], assigned: [] };

    expect(getVisibleResponderRequests(queueState, 'PENDING')).toEqual([]);
    expect(getVisibleResponderRequests(queueState, 'ASSIGNED')).toEqual([]);
    expect(getResponderQueueCounts(queueState)).toEqual({ PENDING: 0, ASSIGNED: 0 });
  });

  it('excludes COMPLETED requests from the active assigned queue while keeping live progress statuses', () => {
    const queueState = {
      pending: [],
      assigned: [
        request('assigned-1', 'ASSIGNED'),
        request('dispatched-1', 'DISPATCHED'),
        request('arrived-1', 'ARRIVED'),
        request('in-progress-1', 'IN_PROGRESS'),
        request('completed-1', 'COMPLETED')
      ]
    };

    expect(getVisibleResponderRequests(queueState, 'ASSIGNED').map(({ id }) => id)).toEqual([
      'assigned-1',
      'dispatched-1',
      'arrived-1',
      'in-progress-1'
    ]);
    expect(getResponderQueueCounts(queueState)).toEqual({ PENDING: 0, ASSIGNED: 4 });
  });
});