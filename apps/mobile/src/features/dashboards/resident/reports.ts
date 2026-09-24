import type { HazardType, ReportSeverity, ReportStatus, SafeReport } from '@safealert/contracts';

import type { BadgeTone, DashboardIconName } from '../shared/types';

export type ResidentReportFilterKey = 'all' | 'active' | 'resolved';

export const residentReportTabs: ReadonlyArray<{
  key: ResidentReportFilterKey;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' }
];

export function filterResidentReports(reports: SafeReport[], filter: ResidentReportFilterKey) {
  switch (filter) {
    case 'all':
      return reports;
    case 'active':
      return reports.filter((report) => report.status === 'PENDING' || report.status === 'VERIFIED');
    case 'resolved':
      return reports.filter((report) => report.status === 'RESOLVED');
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
    case 'RESOLVED':
      return 'Resolved';
  }
}

export function statusDescriptionForResident(status: ReportStatus) {
  switch (status) {
    case 'PENDING':
      return 'Waiting for verification';
    case 'VERIFIED':
      return 'Verified by an officer';
    case 'REJECTED':
      return 'Reviewed and rejected';
    case 'RESOLVED':
      return 'Resolved';
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
    case 'RESOLVED':
      return 'neutral';
  }
}

export function formatResidentReportLocation(report: SafeReport) {
  const [longitude, latitude] = report.location.coordinates;

  return `Lat ${latitude.toFixed(4)}, Long ${longitude.toFixed(4)}`;
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
  const scope = filter === 'active' ? 'active' : filter === 'resolved' ? 'resolved' : 'submitted';

  return `${count} ${scope} report${count === 1 ? '' : 's'}`;
}
