import type {
  CommunityReportSummary,
  HazardType,
  ReportSeverity,
  ReportStatus,
  ReportVoiceEvidence
} from '@safealert/contracts';
import * as Location from 'expo-location';
import type { Href } from 'expo-router';

import type { DashboardIconName } from '../shared/types';

import floodHazardImage from '../../../../assets/hazards/flood.png';
import blockedRoadHazardImage from '../../../../assets/hazards/blocked-road.png';
import landslideHazardImage from '../../../../assets/hazards/landslide.png';
import otherHazardImage from '../../../../assets/hazards/other.png';

export type VolunteerReportListKey = 'nearby' | 'incoming';

export type VolunteerCommunityReport = {
  id: string;
  hazardType: string;
  severity: ReportSeverity;
  locationLabel: string;
  reportedTimeLabel: string;
  reportedDateTimeLabel: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  distanceLabel?: string;
  descriptionPreview: string;
  description: string;
  status: ReportStatus;
  mediaUrl?: string;
  voiceEvidence?: ReportVoiceEvidence;
  relatedCommunityReportCount?: number;
  icon: DashboardIconName;
  hazardImage: typeof floodHazardImage;
  hasPhotoEvidence: boolean;
  hasVoiceEvidence: boolean;
  href: Href;
};

export const volunteerCommunityReportTabs: ReadonlyArray<{
  key: VolunteerReportListKey;
  label: string;
  description: string;
}> = [
  { key: 'nearby', label: 'Near Me', description: 'Within 10 km of your current location' },
  { key: 'incoming', label: 'New Reports', description: 'All eligible reports, newest first' }
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

const hazardTypeImages: Record<HazardType, typeof floodHazardImage> = {
  FLOOD: floodHazardImage,
  BLOCKED_ROAD: blockedRoadHazardImage,
  LANDSLIDE: landslideHazardImage,
  OTHER: otherHazardImage
};

export function mapCommunityReportToVolunteerReport(report: CommunityReportSummary): VolunteerCommunityReport {
  return {
    id: report.id,
    hazardType: hazardTypeLabels[report.hazardType],
    severity: report.severity,
    locationLabel: 'Reported location',
    coordinates: {
      latitude: report.location.coordinates[1],
      longitude: report.location.coordinates[0]
    },
    reportedTimeLabel: formatRelativeTime(report.createdAt),
    reportedDateTimeLabel: formatDateTime(report.createdAt),
    distanceLabel: typeof report.distanceKm === 'number' ? formatDistance(report.distanceKm) : undefined,
    descriptionPreview: createDescriptionPreview(report.description),
    description: report.description,
    status: report.status,
    mediaUrl: report.mediaReference,
    voiceEvidence: report.voiceEvidence,
    relatedCommunityReportCount: report.relatedCommunityReportCount,
    icon: hazardTypeIcons[report.hazardType],
    hazardImage: hazardTypeImages[report.hazardType],
    hasPhotoEvidence: Boolean(report.mediaReference),
    hasVoiceEvidence: Boolean(report.voiceEvidence),
    href: `/volunteer/reports/${report.id}`
  };
}

export function formatLocationName(address: {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
}) {
  const primary = address.name?.trim() || address.street?.trim();
  const area = address.district?.trim() || address.city?.trim() || address.subregion?.trim() || address.region?.trim();
  const parts = [primary, area].filter((value): value is string => Boolean(value));

  return [...new Set(parts)].join(', ');
}

export async function resolveVolunteerReportLocation(report: VolunteerCommunityReport) {
  try {
    const reverseGeocodeAsync = (Location as unknown as {
      reverseGeocodeAsync: (coordinates: { latitude: number; longitude: number }) => Promise<Array<Parameters<typeof formatLocationName>[0]>>;
    }).reverseGeocodeAsync;
    const addresses = await reverseGeocodeAsync(report.coordinates);
    const locationLabel = addresses[0] ? formatLocationName(addresses[0]) : '';
    return locationLabel ? { ...report, locationLabel } : report;
  } catch {
    return report;
  }
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

export const volunteerCommunityReportFixtures: Record<VolunteerReportListKey, VolunteerCommunityReport[]> = {
  nearby: [
    {
      id: 'fixture-nearby-1',
      hazardType: 'Flood',
      severity: 'HIGH',
      locationLabel: 'Riverside Road, Colombo',
      coordinates: { latitude: 6.9271, longitude: 79.8612 },
      reportedTimeLabel: '10 min ago',
      reportedDateTimeLabel: 'Aug 23, 8:40 PM',
      distanceLabel: '0.8 km away',
      descriptionPreview: 'Water is moving across the road shoulder and edging toward nearby homes.',
      description:
        'Residents reported flood water rising quickly along the edge of Riverside Road and beginning to spread toward nearby front steps.',
      status: 'PENDING',
      mediaUrl: 'https://placehold.co/960x640/png?text=Flood+Evidence',
      icon: 'water-outline',
      hazardImage: floodHazardImage,
      hasPhotoEvidence: true,
      hasVoiceEvidence: false,
      href: '/volunteer/reports/fixture-nearby-1'
    }
  ],
  incoming: [
    {
      id: 'fixture-incoming-1',
      hazardType: 'Blocked Road',
      severity: 'MODERATE',
      locationLabel: 'Temple Approach Road, Colombo',
      coordinates: { latitude: 6.928, longitude: 79.87 },
      reportedTimeLabel: '12 min ago',
      reportedDateTimeLabel: 'Aug 23, 8:38 PM',
      descriptionPreview: 'A roadside edge gave way after heavy runoff and now needs confirmation.',
      description:
        'The shoulder on Temple Approach Road appears to have given way after runoff, leaving a narrow and unstable edge beside the lane.',
      status: 'PENDING',
      icon: 'trail-sign-outline',
      hazardImage: blockedRoadHazardImage,
      hasPhotoEvidence: false,
      hasVoiceEvidence: false,
      href: '/volunteer/reports/fixture-incoming-1'
    }
  ]
};
