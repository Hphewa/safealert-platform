import { EMERGENCY_ASSISTANCE_TYPES, RESPONSE_STATUSES, type SafeResponseRequest } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import { presentResidentEmergencyRequest } from './emergencyRequestPresentation';

const summary: Pick<SafeResponseRequest, 'assistanceType' | 'createdAt' | 'status'> = {
  assistanceType: 'MEDICAL_ASSISTANCE',
  createdAt: '2026-09-27T05:05:21.123Z',
  status: 'NEW'
};

describe('resident emergency request presentation', () => {
  it('labels every assistance type from the shared contract', () => {
    expect(EMERGENCY_ASSISTANCE_TYPES.map((assistanceType) =>
      presentResidentEmergencyRequest({ ...summary, assistanceType }).assistanceType
    )).toEqual(['Rescue / Evacuation', 'Medical Assistance', 'Flood Assistance', 'Shelter / Relocation', 'Other']);
  });

  it('labels every lifecycle status without exposing technical enum values', () => {
    expect(RESPONSE_STATUSES.map((status) =>
      presentResidentEmergencyRequest({ ...summary, status }).status
    )).toEqual(['Submitted', 'Assigned', 'Dispatched', 'Arrived', 'In Progress', 'Completed']);
  });

  it('formats the creation timestamp with date, year and local time', () => {
    const { submittedAt } = presentResidentEmergencyRequest(summary);
    const expected = new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(summary.createdAt));
    expect(submittedAt).toBe(expected);
    expect(submittedAt).toContain('2026');
    expect(submittedAt).not.toBe(summary.createdAt);
  });

  it.each([undefined, null, '', 'invalid-date', 0])('handles an invalid or missing timestamp: %j', (createdAt) => {
    // Simulate malformed server data despite the compile-time contract.
    const malformed = { ...summary, createdAt } as unknown as typeof summary;
    expect(presentResidentEmergencyRequest(malformed).submittedAt).toBe('Not available');
  });

  it.each([undefined, null, '', 'UNRECOGNIZED', 'toString', '__proto__'])('uses safe labels for unexpected values: %j', (value) => {
    const malformed = { ...summary, status: value, assistanceType: value } as unknown as typeof summary;
    expect(presentResidentEmergencyRequest(malformed)).toMatchObject({
      assistanceType: 'Emergency Assistance', status: 'Status unavailable'
    });
  });
});
