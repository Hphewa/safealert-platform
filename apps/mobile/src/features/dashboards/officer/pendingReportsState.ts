const reviewedOfficerReportIds = new Set<string>();
const reviewedOfficerReportListeners = new Set<(reportId: string) => void>();

export function recordReviewedOfficerReportId(reportId: string) {
  if (reviewedOfficerReportIds.has(reportId)) {
    return;
  }

  reviewedOfficerReportIds.add(reportId);

  for (const listener of reviewedOfficerReportListeners) {
    listener(reportId);
  }
}

export function consumeReviewedOfficerReportIds() {
  const reportIds = [...reviewedOfficerReportIds];
  reviewedOfficerReportIds.clear();
  return reportIds;
}

export function subscribeToReviewedOfficerReportIds(listener: (reportId: string) => void) {
  reviewedOfficerReportListeners.add(listener);

  return () => {
    reviewedOfficerReportListeners.delete(listener);
  };
}
