import { describe, expect, it } from 'vitest';
import { decisionReasonError, initialRiskAssessmentForm, parseRiskAssessmentForm } from './riskAssessmentForm';

describe('assessment form validation', () => {
  it.each(['', ' ', '-1', '1.5', '1e2', '0x10', 'abc', '9007199254740992'])('rejects non-count input %j rather than coercing it', (peopleAffected) => {
    expect(() => parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected, vulnerablePeople: '0' })).toThrow();
  });
  it('allows zero counts and trims numeric input', () => {
    expect(parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: ' 0 ', vulnerablePeople: '0' })).toMatchObject({ peopleAffected: 0, vulnerablePeople: 0 });
  });
  it('rejects vulnerable people greater than the total', () => {
    expect(() => parseRiskAssessmentForm({ ...initialRiskAssessmentForm, peopleAffected: '10', vulnerablePeople: '11' })).toThrow('cannot exceed');
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
});
