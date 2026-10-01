import type { SafeResponseRequest } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import { presentResponderRequest } from './requestPresentation';

const request = (status: SafeResponseRequest['status']): SafeResponseRequest => ({
  id: 'request-1',
  residentId: 'resident-1',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  affectedPeople: 2,
  medicalNeeds: true,
  injuredPeople: 1,
  vulnerablePeople: {
    children: 0,
    elderlyPeople: 0,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  roadAccessibility: 'LIMITED',
  contact: {
    name: 'Resident User',
    phoneNumber: '+94-77-555-1234'
  },
  description: 'Assistance is needed at the reported location.',
  status,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z'
});

describe('responder request presentation', () => {
  it('presents real pending request data for the request card', () => {
    expect(presentResponderRequest(request('NEW'))).toEqual(
      expect.objectContaining({
        title: 'Medical Assistance',
        location: 'GPS: 6.9271, 79.8612',
        details: ['2 people', '1 injured'],
        status: 'NEW',
        submittedAt: expect.any(String)
      })
    );
  });

  it('presents real assigned request status', () => {
    expect(presentResponderRequest(request('ASSIGNED')).status).toBe('ASSIGNED');
  });

  it('uses safe fallbacks for incomplete display data', () => {
    const incompleteRequest = request('NEW');
    incompleteRequest.affectedPeople = Number.NaN;
    incompleteRequest.injuredPeople = Number.POSITIVE_INFINITY;
    incompleteRequest.createdAt = 'invalid-date';

    expect(presentResponderRequest(incompleteRequest)).toEqual({
      title: 'Medical Assistance',
      location: 'GPS: 6.9271, 79.8612',
      details: ['Not provided people', 'Not provided injured'],
      status: 'NEW',
      submittedAt: undefined
    });
  });

  it.each([
    null,
    [],
    [Number.NaN, 6.9271],
    [79.8612, Number.POSITIVE_INFINITY],
    ['79.8612', '6.9271']
  ])('falls back to Location not provided when coordinates are invalid: %j', (coordinates) => {
    const invalidCoordRequest = request('NEW');
    invalidCoordRequest.location = {
      type: 'Point',
      coordinates: coordinates as unknown as [number, number]
    };

    expect(presentResponderRequest(invalidCoordRequest).location).toBe('Location not provided');
  });
});