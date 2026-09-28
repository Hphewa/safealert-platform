import { describe, expect, it } from 'vitest';
import {
  buildDeleteRiskAssessmentRequest, buildReassessmentRiskAssessmentRequest, buildRiskAssessmentRequest, decisionReasonError,
  assessmentErrorMessage, buildCloseRiskAssessmentRequest, closureNoteError,
  initialRiskAssessmentForm, parseRiskAssessmentForm,
  riskAssessmentFormFromAssessment, validateRiskAssessmentForm
} from './riskAssessmentForm';
import { ApiClientError } from '../../../services/api/client';

describe('assessment form validation', () => {
  it.each(['', ' ', '-1', '1.5', '1e2', '0x10', 'abc', '9007199254740992'])('rejects non-count input %j rather than coercing it', (peopleAffected) => {
    expect(() => parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected, vulnerablePeople: '0' })).toThrow();
  });
  it('allows zero counts and trims numeric input', () => {
    expect(parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: ' 0 ', vulnerablePeople: '0' })).toMatchObject({ peopleAffected: 0, vulnerablePeople: 0 });
  });
  it('rejects vulnerable people greater than the total', () => {
    expect(() => parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '10', vulnerablePeople: '11' })).toThrow('cannot exceed');
    expect(validateRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '10', vulnerablePeople: '11' })).toEqual({ vulnerablePeople: 'Vulnerable people cannot exceed people affected.' });
  });
  it('requires explicit count observations instead of defaulting blanks to zero', () => {
    expect(() => parseRiskAssessmentForm(initialRiskAssessmentForm)).toThrow();
  });
  it('makes a reason optional only when accepting the suggestion', () => {
    expect(decisionReasonError('HIGH', 'HIGH', '   ')).toBeNull();
    expect(decisionReasonError('LOW', 'HIGH', '   ')).not.toBeNull();
    expect(decisionReasonError('HIGH', 'HIGH', 'short')).not.toBeNull();
  });
  it('validates trimmed reason boundaries', () => {
    expect(decisionReasonError('LOW', 'HIGH', '123456789')).not.toBeNull();
    expect(decisionReasonError('LOW', 'HIGH', ' 1234567890 ')).toBeNull();
    expect(decisionReasonError('LOW', 'HIGH', 'a'.repeat(500))).toBeNull();
    expect(decisionReasonError('LOW', 'HIGH', 'a'.repeat(501))).not.toBeNull();
  });
  it('builds the save request with the officer-selected final risk', () => {
    const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '12', vulnerablePeople: '3' });
    expect(buildRiskAssessmentRequest('incident-1', factors, 'HIGH', 'MODERATE', 'The affected area is expanding.')).toEqual({
      incidentId: 'incident-1', ...factors, finalRiskLevel: 'HIGH', decisionReason: 'The affected area is expanding.'
    });
  });
  it('builds a reassessment request with a trimmed required reason and no incident ID', () => {
    const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '12', vulnerablePeople: '3' });

    expect(buildReassessmentRiskAssessmentRequest(
      factors, 'HIGH', 'MODERATE', 'The affected area is expanding.', '  New reports show rising water.  '
    )).toEqual({
      ...factors, finalRiskLevel: 'HIGH', decisionReason: 'The affected area is expanding.',
      reassessmentReason: 'New reports show rising water.'
    });
  });
  it.each(['', '         ', 'short', 'x'.repeat(501)])('rejects an invalid reassessment reason %j', (reassessmentReason) => {
    const factors = parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '12', vulnerablePeople: '3' });
    expect(() => buildReassessmentRiskAssessmentRequest(factors, 'MODERATE', 'MODERATE', '', reassessmentReason)).toThrow();
  });
  it('maps a stale reassessment conflict to a refresh instruction', () => {
    expect(assessmentErrorMessage(new ApiClientError(409, 'ASSESSMENT_NOT_ACTIVE', 'Conflict.')))
      .toBe('This assessment is no longer active. Refresh to view the latest assessment.');
  });
  it('prefills reassessment factors from the current saved assessment', () => {
    expect(riskAssessmentFormFromAssessment({
      hazardSeverity: 'SEVERE', peopleAffected: 15, vulnerablePeople: 6,
      roadAccessibility: 'FULLY_BLOCKED', infrastructureImpact: 'HIGH',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'STORM'
    })).toEqual({
      hazardSeverity: 'SEVERE', peopleAffected: '15', vulnerablePeople: '6',
      roadAccessibility: 'FULLY_BLOCKED', infrastructureImpact: 'HIGH',
      waterLevelTrend: 'RISING_RAPIDLY', weatherCondition: 'STORM'
    });
  });
  it.each(['INCIDENT_RESOLVED', 'HAZARD_NO_LONGER_ACTIVE', 'MONITORING_COMPLETED'] as const)(
    'allows %s without a note and omits blank notes', (reason) => {
      expect(closureNoteError(reason, '   ')).toBeNull();
      expect(buildCloseRiskAssessmentRequest(reason, '   ')).toEqual({ closureReason: reason });
    }
  );
  it('trims optional notes and includes only closure request fields', () => {
    expect(buildCloseRiskAssessmentRequest('INCIDENT_RESOLVED', '  Checked with local team.  ')).toEqual({
      closureReason: 'INCIDENT_RESOLVED', closureNote: 'Checked with local team.'
    });
  });
  it('requires a note for OTHER and applies the shared trimmed 10–500 character limits', () => {
    for (const note of ['', '   ', '123456789']) {
      expect(closureNoteError('OTHER', note)).not.toBeNull();
      expect(() => buildCloseRiskAssessmentRequest('OTHER', note)).toThrow();
    }
    expect(closureNoteError('OTHER', '  1234567890  ')).toBeNull();
    expect(buildCloseRiskAssessmentRequest('OTHER', '  1234567890  ')).toEqual({
      closureReason: 'OTHER', closureNote: '1234567890'
    });
    expect(closureNoteError('OTHER', 'x'.repeat(500))).toBeNull();
    expect(closureNoteError('OTHER', 'x'.repeat(501))).not.toBeNull();
    expect(() => buildCloseRiskAssessmentRequest('OTHER', 'x'.repeat(501))).toThrow();
  });
  it('validates optional predefined-reason notes when supplied', () => {
    expect(closureNoteError('MONITORING_COMPLETED', 'short')).not.toBeNull();
    expect(() => buildCloseRiskAssessmentRequest('MONITORING_COMPLETED', 'short')).toThrow();
    expect(closureNoteError('MONITORING_COMPLETED', 'x'.repeat(501))).not.toBeNull();
    expect(closureNoteError('MONITORING_COMPLETED', 'x'.repeat(500))).toBeNull();
  });
  it.each(['CREATED_BY_MISTAKE', 'DUPLICATE_RECORD', 'INCORRECT_INFORMATION'] as const)(
    'allows predefined delete reason %s without a note', (deleteReason) => {
      expect(buildDeleteRiskAssessmentRequest(deleteReason, '   ')).toEqual({ deleteReason });
    }
  );
  it('trims optional delete notes and requires a meaningful note for OTHER', () => {
    expect(buildDeleteRiskAssessmentRequest('DUPLICATE_RECORD', '  Duplicate field assessment.  ')).toEqual({
      deleteReason: 'DUPLICATE_RECORD', deleteNote: 'Duplicate field assessment.'
    });
    for (const note of ['', '   ', '123456789']) {
      expect(() => buildDeleteRiskAssessmentRequest('OTHER', note)).toThrow();
    }
    expect(buildDeleteRiskAssessmentRequest('OTHER', '  1234567890  ')).toEqual({
      deleteReason: 'OTHER', deleteNote: '1234567890'
    });
    expect(() => buildDeleteRiskAssessmentRequest('OTHER', 'x'.repeat(501))).toThrow();
    expect(buildDeleteRiskAssessmentRequest('OTHER', 'x'.repeat(500)).deleteNote).toHaveLength(500);
  });
  it('applies the note length bounds to optional predefined-reason notes', () => {
    expect(() => buildDeleteRiskAssessmentRequest('INCORRECT_INFORMATION', 'short')).toThrow();
    expect(() => buildDeleteRiskAssessmentRequest('INCORRECT_INFORMATION', 'x'.repeat(501))).toThrow();
    expect(buildDeleteRiskAssessmentRequest('INCORRECT_INFORMATION', 'x'.repeat(500)).deleteNote).toHaveLength(500);
  });
});
