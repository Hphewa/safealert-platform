import type { SafeResponseRequest, SafeUser } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import {
  canRecordFieldUpdate,
  formatUpdateTimestamp,
  validateCompletionDetails,
  validateFieldNotes
} from './fieldUpdateUi';

const responder: SafeUser = {
  id: 'responder-1',
  name: 'Responder User',
  email: 'responder@example.com',
  role: 'EMERGENCY_RESPONDER'
};

const baseRequest: SafeResponseRequest = {
  id: '507f1f77bcf86cd799439011',
  residentId: 'resident-1',
  assignedResponderId: 'responder-1',
  status: 'ASSIGNED',
  assistanceType: 'MEDICAL_ASSISTANCE',
  location: { type: 'Point', coordinates: [79.8612, 6.9271] },
  affectedPeople: 2,
  injuredPeople: 1,
  medicalNeeds: true,
  vulnerablePeople: { children: 0, elderlyPeople: 1, personsWithDisabilities: 0, pregnantPersons: 0 },
  roadAccessibility: 'ACCESSIBLE',
  contact: { name: 'Resident User', phoneNumber: '+94-77-555-1234' },
  description: 'Resident needs medical assistance.',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z'
};

describe('canRecordFieldUpdate', () => {
  it.each(['ASSIGNED', 'DISPATCHED', 'ARRIVED', 'IN_PROGRESS'] as const)(
    'permits field updates when status is %s and responder is assigned',
    (status) => {
      expect(canRecordFieldUpdate({ ...baseRequest, status }, responder)).toBe(true);
    }
  );

  it.each(['NEW', 'COMPLETED', 'CANCELLED'] as const)(
    'disallows field updates when status is %s',
    (status) => {
      expect(canRecordFieldUpdate({ ...baseRequest, status }, responder)).toBe(false);
    }
  );

  it('disallows field updates when logged in user is a different responder', () => {
    const otherResponder: SafeUser = { ...responder, id: 'responder-2' };
    expect(canRecordFieldUpdate(baseRequest, otherResponder)).toBe(false);
  });

  it('disallows field updates when logged in user has a non-responder role', () => {
    const residentUser: SafeUser = { ...responder, role: 'RESIDENT' };
    expect(canRecordFieldUpdate(baseRequest, residentUser)).toBe(false);
  });

  it('disallows field updates for null or invalid request/user inputs', () => {
    expect(canRecordFieldUpdate(null, responder)).toBe(false);
    expect(canRecordFieldUpdate(baseRequest, null)).toBe(false);
    expect(canRecordFieldUpdate({ ...baseRequest, id: 'invalid-id' }, responder)).toBe(false);
  });
});

describe('validateFieldNotes', () => {
  it('returns an error for empty or whitespace-only strings', () => {
    expect(validateFieldNotes('')).toBe('Field update notes cannot be empty.');
    expect(validateFieldNotes('   ')).toBe('Field update notes cannot be empty.');
    expect(validateFieldNotes('\t\n')).toBe('Field update notes cannot be empty.');
  });

  it('returns an error for notes under 3 characters', () => {
    expect(validateFieldNotes('ab')).toBe('Field update notes must be at least 3 characters.');
  });

  it('returns an error for notes exceeding 2000 characters', () => {
    expect(validateFieldNotes('a'.repeat(2001))).toBe('Field update notes must be at most 2000 characters.');
  });

  it('returns null for valid field notes', () => {
    expect(validateFieldNotes('En route to the residential zone via southern bypass.')).toBeNull();
  });
});

describe('validateCompletionDetails', () => {
  it('returns an error when assistanceProvided is missing or under 3 characters', () => {
    expect(validateCompletionDetails({ assistanceProvided: '', completionSummary: 'Done' }))
      .toBe('Please describe the assistance provided to the resident.');
    expect(validateCompletionDetails({ assistanceProvided: 'ok', completionSummary: 'Done' }))
      .toBe('Assistance provided must be at least 3 characters.');
  });

  it('returns an error when assistanceProvided exceeds 1000 characters', () => {
    expect(validateCompletionDetails({ assistanceProvided: 'a'.repeat(1001), completionSummary: 'Done' }))
      .toBe('Assistance provided must be at most 1000 characters.');
  });

  it('returns an error when completionSummary is missing or under 3 characters', () => {
    expect(validateCompletionDetails({ assistanceProvided: 'Administered first aid', completionSummary: '' }))
      .toBe('Please provide a completion summary or outcome.');
    expect(validateCompletionDetails({ assistanceProvided: 'Administered first aid', completionSummary: 'no' }))
      .toBe('Completion summary must be at least 3 characters.');
  });

  it('returns an error when completionSummary exceeds 1000 characters', () => {
    expect(validateCompletionDetails({ assistanceProvided: 'Administered first aid', completionSummary: 'a'.repeat(1001) }))
      .toBe('Completion summary must be at most 1000 characters.');
  });

  it('returns an error when responderRemarks exceeds 1000 characters', () => {
    expect(validateCompletionDetails({
      assistanceProvided: 'Administered first aid',
      completionSummary: 'Patient stable',
      responderRemarks: 'a'.repeat(1001)
    })).toBe('Responder remarks must be at most 1000 characters.');
  });

  it('returns null for valid completion details', () => {
    expect(validateCompletionDetails({
      assistanceProvided: 'Administered first aid and provided warm blanket',
      completionSummary: 'Patient vital signs normalized and handed over to family',
      responderRemarks: 'Follow up advised in 24 hours'
    })).toBeNull();

    expect(validateCompletionDetails({
      assistanceProvided: 'Provided evacuation assistance to safety center',
      completionSummary: 'Resident transferred safely'
    })).toBeNull();
  });
});

describe('formatUpdateTimestamp', () => {
  it('returns formatted string for valid ISO timestamp', () => {
    const formatted = formatUpdateTimestamp('2026-09-24T10:00:00.000Z');
    expect(formatted).not.toBe('Not available');
    expect(typeof formatted).toBe('string');
  });

  it('returns "Not available" for missing or invalid timestamps', () => {
    expect(formatUpdateTimestamp(undefined)).toBe('Not available');
    expect(formatUpdateTimestamp('')).toBe('Not available');
    expect(formatUpdateTimestamp('invalid-date')).toBe('Not available');
  });
});
