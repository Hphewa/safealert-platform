import type {
  CommunityReportSummary,
  HazardType,
  ReportSeverity,
  ReportStatus
} from '@safealert/contracts';
import type { Href } from 'expo-router';

import type { DashboardIconName } from '../shared/types';
import { reportEvidenceUri } from '../shared/api/reportEvidence';

export type VolunteerReportListKey = 'nearby' | 'incoming';

export type VolunteerCommunityReport = {
  id: string;
  hazardType: string;
  severity: ReportSeverity;
  locationLabel: string;
  reportedTimeLabel: string;
  reportedDateTimeLabel: string;
  distanceLabel?: string;
  descriptionPreview: string;
  description: string;
  status: ReportStatus;
  mediaUrl?: string;
  icon: DashboardIconName;
  href: Href;
};

export const volunteerCommunityReportTabs: ReadonlyArray<{
  key: VolunteerReportListKey;
  label: string;
}> = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'incoming', label: 'Incoming' }
];

const hazardTypeLabels: Record<HazardType, string> = {
  FLOOD: 'Flood',
  BLOCKED_ROAD: 'Blocked Road',
  LANDSLIDE: 'Landslide',
  OTHER: 'Other Hazard'
};

const hazardTypeIcons: Record<HazardType, DashboardIconName> = {
  FLOOD: 'water-outline',
  BLOCKED_ROAD: 'trail-sign-outline',
  LANDSLIDE: 'leaf-outline',
  OTHER: 'alert-circle-outline'
};

export function mapCommunityReportToVolunteerReport(report: CommunityReportSummary): VolunteerCommunityReport {
  return {
    id: report.id,
    hazardType: hazardTypeLabels[report.hazardType],
    severity: report.severity,
    locationLabel: formatCoordinates(report.location.coordinates[1], report.location.coordinates[0]),
    reportedTimeLabel: formatRelativeTime(report.createdAt),
    reportedDateTimeLabel: formatDateTime(report.createdAt),
    distanceLabel: typeof report.distanceKm === 'number' ? formatDistance(report.distanceKm) : undefined,
    descriptionPreview: createDescriptionPreview(report.description),
    description: report.description,
    status: report.status,
    mediaUrl: reportEvidenceUri(report),
    icon: hazardTypeIcons[report.hazardType],
    href: `/volunteer/reports/${report.id}`
  };
}

export function createDescriptionPreview(description: string) {
  const normalized = description.trim();

  if (normalized.length <= 96) {
    return normalized;
  }

  return `${normalized.slice(0, 93).trimEnd()}...`;
}

export function formatDateTime(isoDateTime: string) {
  const date = new Date(isoDateTime);

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatRelativeTime(isoDateTime: string) {
  const date = new Date(isoDateTime).getTime();
  const deltaMinutes = Math.max(0, Math.round((Date.now() - date) / 60000));

  if (deltaMinutes < 1) {
    return 'Just now';
  }

  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `${deltaHours} hr ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
}

export function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)} km away`;
}

export function formatCoordinates(latitude: number, longitude: number) {
  return `Lat ${latitude.toFixed(4)}, Long ${longitude.toFixed(4)}`;
}

export const volunteerCommunityReportFixtures: Record<VolunteerReportListKey, VolunteerCommunityReport[]> = {
  nearby: [
    {
      id: 'fixture-nearby-1',
      hazardType: 'Flood',
      severity: 'HIGH',
      locationLabel: 'Lat 6.9271, Long 79.8612',
      reportedTimeLabel: '10 min ago',
      reportedDateTimeLabel: 'Aug 23, 8:40 PM',
      distanceLabel: '0.8 km away',
      descriptionPreview: 'Water is moving across the road shoulder and edging toward nearby homes.',
      description:
        'Residents reported flood water rising quickly along the edge of Riverside Road and beginning to spread toward nearby front steps.',
      status: 'PENDING',
      mediaUrl: 'https://placehold.co/960x640/png?text=Flood+Evidence',
      icon: 'water-outline',
      href: '/volunteer/reports/fixture-nearby-1'
    }
  ],
  incoming: [
    {
      id: 'fixture-incoming-1',
      hazardType: 'Blocked Road',
      severity: 'MODERATE',
      locationLabel: 'Lat 6.9280, Long 79.8700',
      reportedTimeLabel: '12 min ago',
      reportedDateTimeLabel: 'Aug 23, 8:38 PM',
      descriptionPreview: 'A roadside edge gave way after heavy runoff and now needs confirmation.',
      description:
        'The shoulder on Temple Approach Road appears to have given way after runoff, leaving a narrow and unstable edge beside the lane.',
      status: 'PENDING',
      icon: 'trail-sign-outline',
      href: '/volunteer/reports/fixture-incoming-1'
    }
  ]
};
