export type ReportSubmissionStatus = 'idle' | 'uploading' | 'submitting' | 'error';

export type ReportSubmissionGuardRef = {
  current: boolean;
};

export function isReportSubmissionActive(status: ReportSubmissionStatus) {
  return status === 'uploading' || status === 'submitting';
}

export function canSubmitReport({
  isValid,
  status
}: {
  isValid: boolean;
  status: ReportSubmissionStatus;
}) {
  return isValid && !isReportSubmissionActive(status);
}

export function beginReportSubmission(
  submitInFlightRef: ReportSubmissionGuardRef,
  isSubmitting: boolean
) {
  if (submitInFlightRef.current || isSubmitting) {
    return false;
  }

  submitInFlightRef.current = true;
  return true;
}

export function clearReportSubmission(submitInFlightRef: ReportSubmissionGuardRef) {
  submitInFlightRef.current = false;
}
