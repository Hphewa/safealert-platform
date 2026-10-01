import { describe, expect, it } from 'vitest';

import {
  validateEmergencyAssistanceDraft,
  type EmergencyAssistanceDraft
} from './emergencyAssistanceDraft';

const validDraft: EmergencyAssistanceDraft = {
  assistanceType: 'RESCUE_EVACUATION',
  location: {
    status: 'DETECTED',
    latitude: 6.9271,
    longitude: 79.8612,
    accuracyMeters: 10,
    capturedAt: '2026-10-01T10:00:00.000Z',
    errorMessage: null
  },
  affectedPeopleCount: 3,
  medicalNeeds: {
    requiresMedicalAssistance: true,
    injuredCount: 1
  },
  vulnerablePeople: {
    children: 1,
    elderlyPeople: 1,
    personsWithDisabilities: 0,
    pregnantPersons: 0
  },
  accessCondition: 'ACCESSIBLE',
  contactDetails: {
    name: 'Kasun Perera',
    email: 'kasun@example.com',
    phoneNumber: '+94 77 123 4567',
    usesAuthenticatedProfile: true
  },
  emergencyDescription: 'Rising flood waters trapped us on the first floor.',
  specialRequirements: 'Elderly person needs wheelchair assistance.',
  reviewRequestedAt: null
};

describe('validateEmergencyAssistanceDraft (LDFEW-383)', () => {
  it('passes validation when all required fields contain valid data', () => {
    const result = validateEmergencyAssistanceDraft(validDraft);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects missing assistance type', () => {
    const result = validateEmergencyAssistanceDraft({ ...validDraft, assistanceType: null });
    expect(result.isValid).toBe(false);
    expect(result.errors.assistanceType).toBe('Select an assistance type.');
  });

  it('rejects invalid affected people counts (0, negative, non-integer)', () => {
    expect(validateEmergencyAssistanceDraft({ ...validDraft, affectedPeopleCount: 0 }).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft({ ...validDraft, affectedPeopleCount: -2 }).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft({ ...validDraft, affectedPeopleCount: 1.5 }).isValid).toBe(false);
  });

  it('rejects location when not in DETECTED status', () => {
    const idleLocation = {
      ...validDraft,
      location: { status: 'IDLE' as const, latitude: null, longitude: null, accuracyMeters: null, capturedAt: null, errorMessage: null }
    };
    expect(validateEmergencyAssistanceDraft(idleLocation).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft(idleLocation).errors.location).toBe('Current location is required.');
  });

  it('rejects out-of-bounds or non-finite GPS coordinates', () => {
    const invalidLat: EmergencyAssistanceDraft = {
      ...validDraft,
      location: {
        status: 'DETECTED',
        latitude: 95,
        longitude: 79.8612,
        accuracyMeters: 10,
        capturedAt: '2026-10-01T10:00:00.000Z',
        errorMessage: null
      }
    };
    expect(validateEmergencyAssistanceDraft(invalidLat).isValid).toBe(false);

    const invalidLon: EmergencyAssistanceDraft = {
      ...validDraft,
      location: {
        status: 'DETECTED',
        latitude: 6.9271,
        longitude: 190,
        accuracyMeters: 10,
        capturedAt: '2026-10-01T10:00:00.000Z',
        errorMessage: null
      }
    };
    expect(validateEmergencyAssistanceDraft(invalidLon).isValid).toBe(false);
  });

  it('validates medical needs and injured count relationships', () => {
    // Injured cannot exceed affected people
    const excessInjured = {
      ...validDraft,
      affectedPeopleCount: 2,
      medicalNeeds: { requiresMedicalAssistance: true, injuredCount: 3 }
    };
    expect(validateEmergencyAssistanceDraft(excessInjured).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft(excessInjured).errors.injuredCount).toBe(
      'Injured people cannot exceed the total affected people.'
    );

    // If requiresMedicalAssistance is false, injuredCount must be 0
    const noMedicalWithInjured = {
      ...validDraft,
      medicalNeeds: { requiresMedicalAssistance: false, injuredCount: 1 }
    };
    expect(validateEmergencyAssistanceDraft(noMedicalWithInjured).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft(noMedicalWithInjured).errors.injuredCount).toBe(
      'Set injured people to 0 when no medical assistance is required.'
    );

    // Negative injured count is rejected
    const negativeInjured = {
      ...validDraft,
      medicalNeeds: { requiresMedicalAssistance: true, injuredCount: -1 }
    };
    expect(validateEmergencyAssistanceDraft(negativeInjured).isValid).toBe(false);
  });

  it('rejects negative vulnerable person counts', () => {
    const negativeVulnerable = {
      ...validDraft,
      vulnerablePeople: { ...validDraft.vulnerablePeople, children: -1 }
    };
    expect(validateEmergencyAssistanceDraft(negativeVulnerable).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft(negativeVulnerable).errors.vulnerablePeople).toBe(
      'Vulnerable-person counts cannot be negative.'
    );
  });

  it('rejects missing road accessibility condition', () => {
    const missingAccess = { ...validDraft, accessCondition: null };
    expect(validateEmergencyAssistanceDraft(missingAccess).isValid).toBe(false);
    expect(validateEmergencyAssistanceDraft(missingAccess).errors.accessCondition).toBe(
      'Select the current road/access condition.'
    );
  });

  it('validates contact details (name, email, phone number format and length)', () => {
    // Missing contact name
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, name: '' }
      }).isValid
    ).toBe(false);

    // Name too short (< 2 chars per backend schema)
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, name: 'A' }
      }).errors.contactDetails
    ).toBe('Contact name must be at least 2 characters.');

    // Empty phone number
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, phoneNumber: '' }
      }).errors.contactDetails
    ).toBe('Enter a contact phone number.');

    // Phone number with fewer than 7 digits
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, phoneNumber: '12345' }
      }).errors.contactDetails
    ).toBe('Enter a valid phone number.');

    // Valid formats accepted
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, phoneNumber: '0771234567' }
      }).isValid
    ).toBe(true);

    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        contactDetails: { ...validDraft.contactDetails, phoneNumber: '+94-77-555-1234' }
      }).isValid
    ).toBe(true);
  });

  it('validates emergency description (required, min 3 chars, max 500 chars)', () => {
    // Empty description
    expect(
      validateEmergencyAssistanceDraft({ ...validDraft, emergencyDescription: '' }).errors.emergencyDescription
    ).toBe('Describe the emergency.');

    // Description too short (< 3 chars per backend schema)
    expect(
      validateEmergencyAssistanceDraft({ ...validDraft, emergencyDescription: 'ab' }).errors.emergencyDescription
    ).toBe('Description must be at least 3 characters.');

    // Description exceeding max length
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        emergencyDescription: 'a'.repeat(501)
      }).errors.emergencyDescription
    ).toBe('Keep the description under 500 characters.');
  });

  it('validates optional special requirements max length (300 chars)', () => {
    // Empty special requirements is valid
    expect(validateEmergencyAssistanceDraft({ ...validDraft, specialRequirements: '' }).isValid).toBe(true);

    // Exceeding 300 chars is rejected
    expect(
      validateEmergencyAssistanceDraft({
        ...validDraft,
        specialRequirements: 'b'.repeat(301)
      }).errors.specialRequirements
    ).toBe('Keep special requirements under 300 characters.');
  });
});
