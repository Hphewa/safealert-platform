import { describe, expect, it } from 'vitest';

import { descriptionMinLength, type ReportHazardDraft, validateReportHazardDraft } from './reportDraft';

const validDraft: ReportHazardDraft = {
  hazardType: 'FLOOD',
  severity: 'HIGH',
  description: 'Water is rising near the bridge.',
  location: {
    status: 'DETECTED',
    latitude: 6.9271,
    longitude: 79.8612,
    accuracyMeters: 12,
    capturedAt: '2026-09-24T00:00:00.000Z',
    errorMessage: null
  },
  photoEvidence: {
    status: 'EMPTY',
    selected: null,
    message: null
  },
  voiceEvidence: {
    status: 'EMPTY',
    selected: null,
    message: null
  }
};

describe('validateReportHazardDraft', () => {
  it('accepts a complete resident hazard report draft', () => {
    expect(validateReportHazardDraft(validDraft)).toEqual({
      errors: {},
      isValid: true
    });
  });

  it('rejects descriptions shorter than the backend create report schema', () => {
    const result = validateReportHazardDraft({
      ...validDraft,
      description: 'Hi'
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.description).toBe(`Enter at least ${descriptionMinLength} characters.`);
  });

  it('requires a specific hazard name when Other is selected', () => {
    const missingName = validateReportHazardDraft({ ...validDraft, hazardType: 'OTHER', otherHazardType: '' });
    expect(missingName.errors.otherHazardType).toBe('Tell us what type of hazard this is.');

    const namedHazard = validateReportHazardDraft({
      ...validDraft,
      hazardType: 'OTHER',
      otherHazardType: 'Earthquake'
    });
    expect(namedHazard.isValid).toBe(true);
  });

  it('reports field-specific errors before the review screen', () => {
    const result = validateReportHazardDraft({
      ...validDraft,
      hazardType: null,
      severity: null,
      description: '',
      location: {
        status: 'ERROR',
        latitude: null,
        longitude: null,
        errorMessage: 'Location unavailable.'
      }
    });

    expect(result.errors).toEqual({
      hazardType: 'Select a hazard type.',
      location: 'Location is required.',
      severity: 'Select the observed severity.',
      description: 'Enter a short description.'
    });
  });
});
