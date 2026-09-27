import type { HazardType, ReportSeverity, ReportStatus, SafeReport } from '@safealert/contracts';

import type { Href } from 'expo-router';

import type { BadgeTone, DashboardIconName } from '../shared/types';

export type ResidentReportFilterKey = 'all' | 'pending' | 'verified' | 'rejected' | 'cancelled';

export const residentReportTabs: ReadonlyArray<{
  key: ResidentReportFilterKey;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' }
];

export function filterResidentReports(reports: SafeReport[], filter: ResidentReportFilterKey) {
  switch (filter) {
    case 'all':
      return reports;
    case 'pending':
      return reports.filter((report) => report.status === 'PENDING');
    case 'verified':
      return reports.filter((report) => report.status === 'VERIFIED');
    case 'rejected':
      return reports.filter((report) => report.status === 'REJECTED');
    case 'cancelled':
      return reports.filter((report) => report.status === 'CANCELLED');
  }
}

export function hazardLabelForResident(hazardType: HazardType) {
  switch (hazardType) {
    case 'FLOOD':
      return 'Flood';
    case 'BLOCKED_ROAD':
      return 'Blocked Road';
    case 'LANDSLIDE':
      return 'Landslide';
    case 'OTHER':
      return 'Other Hazard';
  }
}

export function hazardIconForResident(hazardType: HazardType): DashboardIconName {
  switch (hazardType) {
    case 'FLOOD':
      return 'water-outline';
    case 'BLOCKED_ROAD':
      return 'trail-sign-outline';
    case 'LANDSLIDE':
      return 'leaf-outline';
    case 'OTHER':
      return 'alert-circle-outline';
  }
}

export function severityToneForResident(severity: ReportSeverity): BadgeTone {
  switch (severity) {
    case 'LOW':
      return 'low';
    case 'MODERATE':
      return 'moderate';
    case 'HIGH':
      return 'high';
  }
}

export function statusLabelForResident(status: ReportStatus) {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'VERIFIED':
      return 'Verified';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    case 'RESOLVED':
      return 'Resolved';
  }
}

export function statusDescriptionForResident(status: ReportStatus) {
  switch (status) {
    case 'PENDING':
      return 'Waiting for official verification';
    case 'VERIFIED':
      return 'A disaster officer verified this report.';
    case 'REJECTED':
      return 'A disaster officer reviewed this report and did not verify it.';
    case 'CANCELLED':
      return 'You cancelled this report before official review.';
    case 'RESOLVED':
      return 'This report is no longer active.';
  }
}

export function officialReviewDetailForResident(status: ReportStatus) {
  switch (status) {
    case 'PENDING':
      return 'A disaster officer has not completed the official review yet.';
    case 'VERIFIED':
      return 'A disaster officer verified this report.';
    case 'REJECTED':
      return 'A disaster officer reviewed this report and did not verify it.';
    case 'CANCELLED':
      return 'You cancelled this report before official review.';
    case 'RESOLVED':
      return 'This report is no longer active.';
  }
}

export function statusToneForResident(status: ReportStatus): BadgeTone {
  switch (status) {
    case 'PENDING':
      return 'info';
    case 'VERIFIED':
      return 'success';
    case 'REJECTED':
      return 'critical';
    case 'CANCELLED':
      return 'neutral';
    case 'RESOLVED':
      return 'neutral';
  }
}

export function formatResidentReportLocation(report: SafeReport) {
  const [longitude, latitude] = report.location.coordinates;

  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function formatResidentReportSubmittedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Submitted time unavailable';
  }

  return `Submitted ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}

export function formatResidentReportCount(count: number, filter: ResidentReportFilterKey) {
  const scopeByFilter: Record<ResidentReportFilterKey, string> = {
    all: 'submitted',
    pending: 'pending',
    verified: 'verified',
    rejected: 'rejected',
    cancelled: 'cancelled'
  };
  const scope = scopeByFilter[filter];

  return `${count} ${scope} report${count === 1 ? '' : 's'}`;
}

export type ResidentReportTimelineTone = 'success' | 'pending' | 'critical' | 'neutral';

export type ResidentReportTimelineItem = {
  id: string;
  title: string;
  detail: string;
  timeLabel?: string;
  tone: ResidentReportTimelineTone;
};

export function residentReportStatusHref(reportId: string) {
  return {
    pathname: '/resident/report-status',
    params: { reportId }
  } as const satisfies Href;
}

export function formatResidentReportDateTime(value: string | undefined) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function residentReportStatusSummary(report: SafeReport) {
  switch (report.status) {
    case 'PENDING':
      return 'Waiting for official verification';
    case 'VERIFIED':
      return report.verifiedAt
        ? `Verified ${formatResidentReportDateTime(report.verifiedAt)}`
        : 'A disaster officer verified this report.';
    case 'REJECTED':
      return report.rejectionReason ?? 'Reviewed and rejected';
    case 'CANCELLED':
      return report.cancelledAt
        ? `Cancelled ${formatResidentReportDateTime(report.cancelledAt)}`
        : 'You cancelled this report before official review.';
    case 'RESOLVED':
      return 'This report is no longer active.';
  }
}

export function buildResidentReportTimeline(report: SafeReport): ResidentReportTimelineItem[] {
  const timeline: ResidentReportTimelineItem[] = [
    {
      id: 'submitted',
      title: 'Report Submitted',
      detail: 'Your report was received by SafeAlert.',
      timeLabel: formatResidentReportDateTime(report.createdAt),
      tone: 'success'
    }
  ];

  const reviewEvents = report.verificationHistory ?? [];
  const verificationEvent = reviewEvents.find((event) => event.action === 'VERIFY');
  const rejectionEvent = [...reviewEvents].reverse().find((event) => event.action === 'REJECT');

  if (report.status === 'PENDING') {
    timeline.push({
      id: 'waiting',
      title: 'Waiting for Official Verification',
      detail: 'A disaster officer has not completed the official review yet.',
      tone: 'pending'
    });
    return timeline;
  }

  if (report.status === 'VERIFIED' || (report.status === 'RESOLVED' && (report.verifiedAt || verificationEvent))) {
    const verifiedAt = report.verifiedAt ?? (verificationEvent?.action === 'VERIFY' ? verificationEvent.verifiedAt : undefined);

    timeline.push({
      id: 'verified',
      title: 'Officially Verified',
      detail: 'A disaster officer verified this report.',
      timeLabel: formatResidentReportDateTime(verifiedAt),
      tone: 'success'
    });
  }

  if (report.status === 'REJECTED') {
    const rejectedAt = report.rejectedAt ?? (rejectionEvent?.action === 'REJECT' ? rejectionEvent.rejectedAt : undefined);
    const reason = report.rejectionReason ?? (rejectionEvent?.action === 'REJECT' ? rejectionEvent.rejectionReason : undefined);

    timeline.push({
      id: 'rejected',
      title: 'Report Rejected',
      detail: reason ? `Reason: ${reason}` : 'The submitted report was rejected after review.',
      timeLabel: formatResidentReportDateTime(rejectedAt),
      tone: 'critical'
    });
  }

  if (report.status === 'CANCELLED') {
    timeline.push({
      id: 'cancelled',
      title: 'Report Cancelled',
      detail: 'This report was cancelled before verification.',
      timeLabel: formatResidentReportDateTime(report.cancelledAt ?? report.updatedAt),
      tone: 'neutral'
    });
  }

  if (report.status === 'RESOLVED') {
    timeline.push({
      id: 'resolved',
      title: 'Resolved',
      detail: 'This report is no longer active.',
      tone: 'neutral'
    });
  }

  return timeline;
}

export function canPreviewResidentReportMedia(mediaReference: string | undefined) {
  return Boolean(mediaReference && /^(https?:|data:image\/)/i.test(mediaReference));
}

export function residentReportEditHref(reportId: string) {
  return {
    pathname: '/resident/report-edit',
    params: { reportId }
  } as const satisfies Href;
}

export function isResidentReportEditable(report: SafeReport) {
  return report.status === 'PENDING';
}
