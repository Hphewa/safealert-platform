import {
  REPORT_REJECTION_REASON_MAX_LENGTH,
  REPORT_REJECTION_REASON_MIN_LENGTH,
  type HazardType,
  type ReportSeverity,
  type ReportVoiceEvidence,
  type ReportStatus,
  type SafeReport
} from '@safealert/contracts';
import type { Href } from 'expo-router';

import { canPreviewImageMedia, resolveMediaReferenceUri } from '../shared/media/mediaReference';
import type { BadgeTone, DashboardIconName } from '../shared/types';

export const officerReportHazardFilters = ['ALL', 'FLOOD', 'BLOCKED_ROAD', 'LANDSLIDE', 'OTHER'] as const;

export type OfficerReportHazardFilter = (typeof officerReportHazardFilters)[number];

export type OfficerReportChecklistKey =
  | 'locationConfirmed'
  | 'timeValid'
  | 'multipleReports'
  | 'photoEvidence'
  | 'fieldUpdate';

export type OfficerGroupedReportSummary = {
  id: string;
  hazardType: HazardType;
  hazardLabel: string;
  severity: ReportSeverity;
  status: ReportStatus;
  statusLabel: string;
  locationLabel: string;
  latestUpdateLabel: string;
  communityReportsCount: number;
  communityReportsLabel: string;
  descriptionPreview: string;
  searchText: string;
  tone: BadgeTone;
  icon: DashboardIconName;
  href: Href;
};

export type OfficerReportVolunteerEvidence = {
  id: string;
  observation: string;
  roadCondition?: string;
  waterLevel?: string;
  photoUrl?: string;
  photoLabel?: string;
  confirmedAtLabel: string;
};

export type OfficerReportTimelineEvent = {
  id: string;
  title: string;
  detail: string;
  timeLabel: string;
  icon: DashboardIconName;
};

export type OfficerReportReviewRecord = OfficerGroupedReportSummary & {
  reportedTimeLabel: string;
  residentDescription: string;
  residentPhotoUrl?: string;
  residentPhotoLabel?: string;
  residentMediaReference?: string;
  residentVoiceEvidence?: ReportVoiceEvidence;
  locationDetails: string;
  relatedReportsCount: number;
  relatedReportsLabel: string;
  volunteerEvidence: OfficerReportVolunteerEvidence[];
  timeline: OfficerReportTimelineEvent[];
  checklist: Record<OfficerReportChecklistKey, boolean>;
};

export const officerReportFilterOptions: ReadonlyArray<{
  key: OfficerReportHazardFilter;
  label: string;
}> = [
  { key: 'ALL', label: 'All' },
  { key: 'FLOOD', label: 'Flood' },
  { key: 'BLOCKED_ROAD', label: 'Blocked Road / Road' },
  { key: 'LANDSLIDE', label: 'Landslide' },
  { key: 'OTHER', label: 'Other' }
];

export function hazardLabelForOfficer(hazardType: HazardType) {
  switch (hazardType) {
    case 'FLOOD':
      return 'Flood';
    case 'BLOCKED_ROAD':
      return 'Blocked Road';
    case 'LANDSLIDE':
      return 'Landslide';
    case 'OTHER':
      return 'Other';
  }
}

export function hazardToneForOfficer(hazardType: HazardType): BadgeTone {
  switch (hazardType) {
    case 'FLOOD':
      return 'info';
    case 'BLOCKED_ROAD':
      return 'moderate';
    case 'LANDSLIDE':
      return 'high';
    case 'OTHER':
      return 'neutral';
  }
}

export function statusLabelForOfficer(status: ReportStatus) {
  switch (status) {
    case 'PENDING':
      return 'Pending Review';
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

export function formatCommunityReportsLabel(count: number) {
  return `${count} Community Report${count === 1 ? '' : 's'}`;
}

export type OfficerRejectionReasonValidation = {
  isValid: boolean;
  normalizedReason: string;
  errorMessage: string | null;
};

export function validateOfficerRejectionReason(reason: string): OfficerRejectionReasonValidation {
  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    return {
      isValid: false,
      normalizedReason,
      errorMessage: 'Enter a reason for rejecting this report.'
    };
  }

  if (normalizedReason.length < REPORT_REJECTION_REASON_MIN_LENGTH) {
    return {
      isValid: false,
      normalizedReason,
      errorMessage: `Enter at least ${REPORT_REJECTION_REASON_MIN_LENGTH} characters.`
    };
  }

  if (normalizedReason.length > REPORT_REJECTION_REASON_MAX_LENGTH) {
    return {
      isValid: false,
      normalizedReason,
      errorMessage: `Keep the reason to ${REPORT_REJECTION_REASON_MAX_LENGTH} characters or fewer.`
    };
  }

  return {
    isValid: true,
    normalizedReason,
    errorMessage: null
  };
}

export function filterOfficerGroupedReports(
  reports: OfficerGroupedReportSummary[],
  searchText: string,
  hazardFilter: OfficerReportHazardFilter
) {
  const normalizedSearch = searchText.trim().toLowerCase();

  return reports.filter((report) => {
    const matchesHazard = hazardFilter === 'ALL' || report.hazardType === hazardFilter;

    if (!matchesHazard) {
      return false;
    }

    return !normalizedSearch || report.searchText.toLowerCase().includes(normalizedSearch);
  });
}

export function formatOfficerReportSearchSummary(count: number) {
  return `${count} pending report${count === 1 ? '' : 's'} match your filters`;
}

export function mapSafeReportToOfficerGroupedReportSummary(
  report: SafeReport,
  now = new Date()
): OfficerGroupedReportSummary {
  const locationLabel = formatOfficerCoordinates(report.location.coordinates);

  return {
    id: report.id,
    hazardType: report.hazardType,
    hazardLabel: hazardLabelForOfficer(report.hazardType),
    severity: report.severity,
    status: report.status,
    statusLabel: statusLabelForOfficer(report.status),
    locationLabel,
    latestUpdateLabel: formatOfficerRelativeTime(report.updatedAt, now),
    communityReportsCount: 1,
    communityReportsLabel: formatCommunityReportsLabel(1),
    descriptionPreview: report.description,
    searchText: `${hazardLabelForOfficer(report.hazardType)} ${locationLabel} ${report.description}`.toLowerCase(),
    tone: hazardToneForOfficer(report.hazardType),
    icon: iconForOfficerHazard(report.hazardType),
    href: `/officer/reports/${report.id}` as Href
  };
}

export function mapSafeReportToOfficerReviewRecord(
  report: SafeReport,
  now = new Date()
): OfficerReportReviewRecord {
  const summary = mapSafeReportToOfficerGroupedReportSummary(report, now);
  const hasPhotoEvidence = Boolean(report.mediaReference);
  const hasVoiceEvidence = Boolean(report.voiceEvidence);
  const residentPhotoUri = resolveMediaReferenceUri(report.mediaReference);
  const canDisplayPhoto = canPreviewImageMedia(residentPhotoUri);
  const timeline: OfficerReportTimelineEvent[] = [
    {
      id: `${report.id}-submitted`,
      title: 'Report submitted',
      detail: 'The resident report entered the official review queue.',
      timeLabel: formatOfficerRelativeTime(report.createdAt, now),
      icon: 'document-text-outline'
    }
  ];

  if (report.mediaReference) {
    timeline.push({
      id: `${report.id}-photo`,
      title: 'Photo added',
      detail: 'The resident attached photo evidence to the report.',
      timeLabel: formatOfficerRelativeTime(report.createdAt, now),
      icon: 'camera-outline'
    });
  }

  if (report.voiceEvidence) {
    timeline.push({
      id: `${report.id}-voice`,
      title: 'Voice note added',
      detail: 'The resident attached a voice note to the report.',
      timeLabel: formatOfficerRelativeTime(report.createdAt, now),
      icon: 'mic-outline'
    });
  }

  return {
    ...summary,
    reportedTimeLabel: formatOfficerRelativeTime(report.createdAt, now),
    residentDescription: report.description,
    ...(canDisplayPhoto && residentPhotoUri
      ? {
          residentPhotoUrl: residentPhotoUri,
          residentPhotoLabel: 'Resident photo evidence'
        }
      : {}),
    ...(report.mediaReference ? { residentMediaReference: report.mediaReference } : {}),
    ...(report.voiceEvidence ? { residentVoiceEvidence: report.voiceEvidence } : {}),
    locationDetails: `Coordinates: ${summary.locationLabel}`,
    relatedReportsCount: 1,
    relatedReportsLabel: formatCommunityReportsLabel(1),
    volunteerEvidence: [],
    timeline,
    checklist: {
      locationConfirmed: false,
      timeValid: false,
      multipleReports: false,
      photoEvidence: hasPhotoEvidence || hasVoiceEvidence,
      fieldUpdate: false
    }
  };
}

function formatOfficerCoordinates([longitude, latitude]: [number, number]) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatOfficerRelativeTime(value: string, now: Date) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 'Time unavailable';
  }

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));

  if (elapsedSeconds < 60) {
    return 'Just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function iconForOfficerHazard(hazardType: HazardType): DashboardIconName {
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

