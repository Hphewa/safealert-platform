import { describe, expect, it, vi } from 'vitest';

import {
  beginReportSubmission,
  canSubmitReport,
  clearReportSubmission,
  isReportSubmissionActive,
  type ReportSubmissionGuardRef
} from './reportSubmissionGuard';

describe('report submission guard', () => {
  it('allows two rapid submit attempts to start only one request flow', () => {
    const submitInFlightRef: ReportSubmissionGuardRef = { current: false };
    const requestFlow = vi.fn();

    if (beginReportSubmission(submitInFlightRef, false)) {
      requestFlow();
    }

    if (beginReportSubmission(submitInFlightRef, false)) {
      requestFlow();
    }

    expect(requestFlow).toHaveBeenCalledOnce();
  });

  it('disables submit while evidence upload or report creation is active', () => {
    expect(isReportSubmissionActive('uploading')).toBe(true);
    expect(isReportSubmissionActive('submitting')).toBe(true);
    expect(canSubmitReport({ isValid: true, status: 'uploading' })).toBe(false);
    expect(canSubmitReport({ isValid: true, status: 'submitting' })).toBe(false);
  });

  it('clears the active guard after failure so the resident can retry explicitly', () => {
    const submitInFlightRef: ReportSubmissionGuardRef = { current: false };

    expect(beginReportSubmission(submitInFlightRef, false)).toBe(true);
    clearReportSubmission(submitInFlightRef);

    expect(beginReportSubmission(submitInFlightRef, false)).toBe(true);
  });

  it('keeps success locked so navigation cannot be triggered twice', () => {
    const submitInFlightRef: ReportSubmissionGuardRef = { current: false };
    const navigateToSuccess = vi.fn();

    if (beginReportSubmission(submitInFlightRef, false)) {
      navigateToSuccess();
    }

    if (beginReportSubmission(submitInFlightRef, false)) {
      navigateToSuccess();
    }

    expect(navigateToSuccess).toHaveBeenCalledOnce();
    expect(submitInFlightRef.current).toBe(true);
  });
});
