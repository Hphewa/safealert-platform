import type { IncidentWithReportsResponse, SafeRiskAssessment } from '@safealert/contracts';

export type IncidentAssessmentRow = {
  incident: IncidentWithReportsResponse;
  assessment: SafeRiskAssessment | null;
  error?: string;
};

export function latestIncidentReportAt(incident: IncidentWithReportsResponse) {
  const timestamps = incident.reports
    .map((report) => Date.parse(report.createdAt))
    .filter((timestamp) => Number.isFinite(timestamp));
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}
