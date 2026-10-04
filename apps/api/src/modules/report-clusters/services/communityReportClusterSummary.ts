import type { GeoJsonPoint, ReportSeverity, ReportStatus, SafeReport } from '@safealert/contracts';

export const severityRank: Record<ReportSeverity, number> = {
  LOW: 1,
  MODERATE: 2,
  HIGH: 3
};

export function compareSeverity(left: ReportSeverity, right: ReportSeverity) {
  return severityRank[left] - severityRank[right];
}

export function highestSeverity(reports: SafeReport[]): ReportSeverity {
  return reports
    .map((report) => report.severity)
    .sort((left, right) => compareSeverity(right, left))[0] ?? 'LOW';
}

export function isActiveClusterReport(report: SafeReport) {
  return report.status !== 'CANCELLED' && report.status !== 'REJECTED';
}

export function countReportsByStatus(reports: SafeReport[]) {
  const counts: Record<ReportStatus, number> = {
    PENDING: 0,
    VERIFIED: 0,
    REJECTED: 0,
    CANCELLED: 0,
    RESOLVED: 0
  };

  for (const report of reports) {
    counts[report.status] += 1;
  }

  return counts;
}

export function averageReportLocation(reports: SafeReport[]): GeoJsonPoint {
  const totals = reports.reduce(
    (current, report) => ({
      longitude: current.longitude + report.location.coordinates[0],
      latitude: current.latitude + report.location.coordinates[1]
    }),
    { longitude: 0, latitude: 0 }
  );

  return {
    type: 'Point',
    coordinates: [totals.longitude / reports.length, totals.latitude / reports.length]
  };
}

