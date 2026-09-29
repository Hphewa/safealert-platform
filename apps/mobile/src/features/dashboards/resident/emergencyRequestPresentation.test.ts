import { EMERGENCY_ASSISTANCE_TYPES, RESPONSE_PROGRESS_SEQUENCE, RESPONSE_STATUSES, type SafeResponseRequest } from '@safealert/contracts';
import { describe, expect, it } from 'vitest';

import { buildResidentEmergencyRequestProgress, presentResidentEmergencyRequest, presentResidentEmergencyRequestDetails } from './emergencyRequestPresentation';

const summary: Pick<SafeResponseRequest, 'assistanceType' | 'createdAt' | 'status'> = {
  assistanceType: 'MEDICAL_ASSISTANCE',
  createdAt: '2026-09-27T05:05:21.123Z',
  status: 'NEW'
};

describe('resident emergency request progress', () => {
  it.each([
    ['NEW', ['current', 'future', 'future', 'future', 'future', 'future']],
    ['ASSIGNED', ['reached', 'current', 'future', 'future', 'future', 'future']],
    ['DISPATCHED', ['reached', 'reached', 'current', 'future', 'future', 'future']],
    ['ARRIVED', ['reached', 'reached', 'reached', 'current', 'future', 'future']],
    ['IN_PROGRESS', ['reached', 'reached', 'reached', 'reached', 'current', 'future']],
    ['COMPLETED', ['reached', 'reached', 'reached', 'reached', 'reached', 'current']]
  ] as const)('presents the persisted %s status in lifecycle order', (status, expectedStates) => {
    const stages = buildResidentEmergencyRequestProgress(status);
    expect(stages?.map((stage) => stage.status)).toEqual(['NEW', ...RESPONSE_PROGRESS_SEQUENCE]);
    expect(stages?.map((stage) => stage.label)).toEqual([
      'Submitted', 'Assigned', 'Dispatched', 'Arrived', 'In Progress', 'Completed'
    ]);
    expect(stages?.map((stage) => stage.state)).toEqual(expectedStates);
    expect(stages?.filter((stage) => stage.state === 'current')).toHaveLength(1);
  });

  it.each([undefined, null, '', 'UNKNOWN', 'CANCELLED', 'toString', 4, {}, ['NEW']])(
    'does not infer normal progression for unsupported input: %j', (status) => {
      expect(buildResidentEmergencyRequestProgress(status)).toBeNull();
    }
  );
});

describe('resident emergency request presentation', () => {
  it('labels every assistance type from the shared contract', () => {
    expect(EMERGENCY_ASSISTANCE_TYPES.map((assistanceType) =>
      presentResidentEmergencyRequest({ ...summary, assistanceType }).assistanceType
    )).toEqual(['Rescue / Evacuation', 'Medical Assistance', 'Flood Assistance', 'Shelter / Relocation', 'Other']);
  });

  it('labels every lifecycle status without exposing technical enum values', () => {
    expect(RESPONSE_STATUSES.map((status) =>
      presentResidentEmergencyRequest({ ...summary, status }).status
    )).toEqual(['Submitted', 'Assigned', 'Dispatched', 'Arrived', 'In Progress', 'Completed', 'Cancelled']);
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

describe('resident emergency request detail presentation', () => {
  it('preserves zero counts, negative coordinates and medical assistance not required', () => {
    const request = {
      ...summary, affectedPeople: 1, injuredPeople: 0, medicalNeeds: false,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
      roadAccessibility: 'BLOCKED', location: { type: 'Point', coordinates: [-79.8612, -6.9271] }
    } as SafeResponseRequest;
    const fields = presentResidentEmergencyRequestDetails(request).sections.flatMap((section) => section.fields);
    expect(fields).toEqual(expect.arrayContaining([
      { label: 'Injured people', value: '0' },
      { label: 'Children', value: '0' },
      { label: 'Medical assistance', value: 'Not required' },
      { label: 'Road access', value: 'Blocked' },
      { label: 'Latitude', value: '-6.927100' },
      { label: 'Longitude', value: '-79.861200' }
    ]));
  });

  it.each([
    { type: 'Point', coordinates: [181, 91] },
    { type: 'Point', coordinates: [NaN, Infinity] },
    { type: 'Point', coordinates: [0] },
    { type: 'Point', coordinates: null },
    null
  ])('does not display invalid coordinates: %j', (location) => {
    const request = { ...summary, location } as unknown as SafeResponseRequest;
    const fields = presentResidentEmergencyRequestDetails(request).sections.find((section) => section.title === 'Location')?.fields;
    expect(fields).toEqual([
      { label: 'Latitude', value: 'Not provided' }, { label: 'Longitude', value: 'Not provided' }
    ]);
  });

  it.each([-1, 1.5, NaN, Infinity, null, undefined])('uses a fallback for invalid people counts: %j', (affectedPeople) => {
    const request = { ...summary, affectedPeople } as unknown as SafeResponseRequest;
    const field = presentResidentEmergencyRequestDetails(request).sections.flatMap((section) => section.fields)
      .find((item) => item.label === 'People needing assistance');
    expect(field?.value).toBe('Not provided');
  });

  it('displays completion details section on COMPLETED requests without exposing internal responder remarks or field notes', () => {
    const completedRequest: SafeResponseRequest = {
      ...summary,
      id: '507f1f77bcf86cd799439011',
      residentId: 'resident-1',
      assignedResponderId: 'responder-1',
      status: 'COMPLETED',
      affectedPeople: 1,
      injuredPeople: 0,
      medicalNeeds: false,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
      roadAccessibility: 'ACCESSIBLE',
      contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
      description: 'Need relief pack.',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      updatedAt: '2026-09-24T12:00:00.000Z',
      completedAt: '2026-09-24T12:00:00.000Z',
      assistanceProvided: 'Delivered food rations and potable water.',
      completionSummary: 'Resident received supplies in good order.',
      // Internal fields that MUST NOT be exposed to resident
      fieldNotes: 'Internal dispatch notes - road was tricky.',
      responderRemarks: 'Internal note: resident was agitated initially.'
    };

    const details = presentResidentEmergencyRequestDetails(completedRequest);
    const completionSection = details.sections.find((section) => section.title === 'Completion Details');

    expect(completionSection).toBeDefined();
    expect(completionSection?.fields).toEqual([
      { label: 'Completed date / time', value: expect.any(String) },
      { label: 'Assistance provided', value: 'Delivered food rations and potable water.' },
      { label: 'Completion summary', value: 'Resident received supplies in good order.' }
    ]);

    // Ensure internal notes and responder remarks are never leaked to any field in any section
    const allLabels = details.sections.flatMap((s) => s.fields.map((f) => f.label));
    const allValues = details.sections.flatMap((s) => s.fields.map((f) => f.value));

    expect(allLabels).not.toContain('Field notes');
    expect(allLabels).not.toContain('Responder remarks');
    expect(allValues).not.toContain('Internal dispatch notes - road was tricky.');
    expect(allValues).not.toContain('Internal note: resident was agitated initially.');
  });

  it('does not display completion details section when status is not COMPLETED', () => {
    const inProgressRequest: SafeResponseRequest = {
      ...summary,
      id: '507f1f77bcf86cd799439011',
      residentId: 'resident-1',
      assignedResponderId: 'responder-1',
      status: 'IN_PROGRESS',
      affectedPeople: 1,
      injuredPeople: 0,
      medicalNeeds: false,
      vulnerablePeople: { children: 0, elderlyPeople: 0, personsWithDisabilities: 0, pregnantPersons: 0 },
      roadAccessibility: 'ACCESSIBLE',
      contact: { name: 'Resident', phoneNumber: '+94-77-555-1234' },
      description: 'Need help.',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      updatedAt: '2026-09-24T11:00:00.000Z'
    };

    const details = presentResidentEmergencyRequestDetails(inProgressRequest);
    const completionSection = details.sections.find((section) => section.title === 'Completion Details');
    expect(completionSection).toBeUndefined();
  });
});

