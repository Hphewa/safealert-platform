import type { HazardType, ReportSeverity, ReportStatus } from '@safealert/contracts';
import type { Href } from 'expo-router';

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
  locationDetails: string;
  relatedReportsCount: number;
  relatedReportsLabel: string;
  volunteerEvidence: OfficerReportVolunteerEvidence[];
  timeline: OfficerReportTimelineEvent[];
  checklist: Record<OfficerReportChecklistKey, boolean>;
};

export const officerReportFilterOptions: ReadonlyArray<{ key: OfficerReportHazardFilter; label: string }> = [
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
    case 'RESOLVED':
      return 'Resolved';
  }
}

export function formatCommunityReportsLabel(count: number) {
  return `${count} Community Report${count === 1 ? '' : 's'}`;
}

const officerReportReviewFixtures: OfficerReportReviewRecord[] = [
  {
    id: 'kelani-river-side',
    hazardType: 'FLOOD',
    hazardLabel: hazardLabelForOfficer('FLOOD'),
    severity: 'HIGH',
    status: 'PENDING',
    statusLabel: statusLabelForOfficer('PENDING'),
    locationLabel: 'Kelani River Side, Colombo 06',
    latestUpdateLabel: '1h ago',
    communityReportsCount: 12,
    communityReportsLabel: formatCommunityReportsLabel(12),
    descriptionPreview: 'Flood water is spreading along the river edge and reaching the road shoulder.',
    searchText: 'kelani river side colombo flood water spreading road shoulder resident description',
    tone: hazardToneForOfficer('FLOOD'),
    icon: 'water-outline',
    href: '/officer/reports/kelani-river-side',
    reportedTimeLabel: '2h ago',
    residentDescription:
      'Multiple residents reported water creeping beyond the river bank and beginning to cover the shoulder beside the main access road.',
    residentPhotoUrl: 'https://placehold.co/960x640/png?text=Flood+Report',
    residentPhotoLabel: 'Resident photo evidence',
    locationDetails: 'Mapped near the river edge and the north access lane to the settlement.',
    relatedReportsCount: 12,
    relatedReportsLabel: formatCommunityReportsLabel(12),
    volunteerEvidence: [
      {
        id: 'kelani-volunteer-1',
        observation: 'Water is moving across the road edge but the lane remains passable for light vehicles.',
        roadCondition: 'Shoulder softened and partially submerged.',
        waterLevel: 'Water level approximately ankle to shin height at the edge.',
        photoUrl: 'https://placehold.co/960x640/png?text=Volunteer+Photo',
        photoLabel: 'Volunteer field photo',
        confirmedAtLabel: '40m ago'
      }
    ],
    timeline: [
      {
        id: 'kelani-event-1',
        title: 'Report submitted',
        detail: 'Resident submitted the original flood report with a location pin.',
        timeLabel: '2h ago',
        icon: 'document-text-outline'
      },
      {
        id: 'kelani-event-2',
        title: 'Photo added',
        detail: 'Resident photo evidence was attached to the report.',
        timeLabel: '1h 52m ago',
        icon: 'camera-outline'
      },
      {
        id: 'kelani-event-3',
        title: 'Volunteer field update',
        detail: 'Community volunteer confirmed the water line at the river edge.',
        timeLabel: '40m ago',
        icon: 'create-outline'
      }
    ],
    checklist: {
      locationConfirmed: true,
      timeValid: true,
      multipleReports: true,
      photoEvidence: true,
      fieldUpdate: true
    }
  },
  {
    id: 'temple-approach-road',
    hazardType: 'BLOCKED_ROAD',
    hazardLabel: hazardLabelForOfficer('BLOCKED_ROAD'),
    severity: 'MODERATE',
    status: 'PENDING',
    statusLabel: statusLabelForOfficer('PENDING'),
    locationLabel: 'Temple Approach Road, Kandy',
    latestUpdateLabel: '32m ago',
    communityReportsCount: 8,
    communityReportsLabel: formatCommunityReportsLabel(8),
    descriptionPreview: 'Loose debris and a slumped road edge are restricting access after heavy runoff.',
    searchText: 'temple approach road kandy blocked road debris runoff description',
    tone: hazardToneForOfficer('BLOCKED_ROAD'),
    icon: 'trail-sign-outline',
    href: '/officer/reports/temple-approach-road',
    reportedTimeLabel: '1h ago',
    residentDescription:
      'Residents reported the road edge giving way after runoff, leaving loose debris and a narrow travel lane near the bend.',
    residentPhotoUrl: 'https://placehold.co/960x640/png?text=Blocked+Road',
    residentPhotoLabel: 'Resident road photo',
    locationDetails: 'Recorded near the temple turn and the uphill bend on the approach road.',
    relatedReportsCount: 8,
    relatedReportsLabel: formatCommunityReportsLabel(8),
    volunteerEvidence: [
      {
        id: 'temple-volunteer-1',
        observation: 'The roadway is still open, but vehicles must pass slowly and stay centered.',
        roadCondition: 'Loose gravel and minor shoulder collapse.',
        waterLevel: 'No standing water, only runoff traces.',
        photoUrl: 'https://placehold.co/960x640/png?text=Road+Condition',
        photoLabel: 'Volunteer road photo',
        confirmedAtLabel: '18m ago'
      }
    ],
    timeline: [
      {
        id: 'temple-event-1',
        title: 'Report submitted',
        detail: 'The original report entered the officer queue as pending.',
        timeLabel: '1h ago',
        icon: 'document-text-outline'
      },
      {
        id: 'temple-event-2',
        title: 'Photo added',
        detail: 'Resident attached a photo showing the damaged shoulder.',
        timeLabel: '58m ago',
        icon: 'camera-outline'
      },
      {
        id: 'temple-event-3',
        title: 'Volunteer field update',
        detail: 'Volunteer confirmed the lane is restricted but not fully closed.',
        timeLabel: '18m ago',
        icon: 'create-outline'
      }
    ],
    checklist: {
      locationConfirmed: true,
      timeValid: true,
      multipleReports: true,
      photoEvidence: true,
      fieldUpdate: true
    }
  },
  {
    id: 'pana-ura-hill',
    hazardType: 'LANDSLIDE',
    hazardLabel: hazardLabelForOfficer('LANDSLIDE'),
    severity: 'HIGH',
    status: 'PENDING',
    statusLabel: statusLabelForOfficer('PENDING'),
    locationLabel: 'Pana Ura Hill, Badulla',
    latestUpdateLabel: '18m ago',
    communityReportsCount: 5,
    communityReportsLabel: formatCommunityReportsLabel(5),
    descriptionPreview: 'A small slope collapse has pushed mud and rock across the uphill track.',
    searchText: 'pana ura hill badulla landslide mud rock uphill track',
    tone: hazardToneForOfficer('LANDSLIDE'),
    icon: 'leaf-outline',
    href: '/officer/reports/pana-ura-hill',
    reportedTimeLabel: '55m ago',
    residentDescription:
      'A resident reported a section of the slope giving way and sending mud across the uphill track near several homes.',
    residentPhotoUrl: 'https://placehold.co/960x640/png?text=Landslide+Evidence',
    residentPhotoLabel: 'Resident landslide photo',
    locationDetails: 'Located on the upper track above the small housing cluster near the hillside bend.',
    relatedReportsCount: 5,
    relatedReportsLabel: formatCommunityReportsLabel(5),
    volunteerEvidence: [
      {
        id: 'pana-volunteer-1',
        observation: 'Fresh soil and scattered rock are visible across the track.',
        roadCondition: 'Track is only passable on foot.',
        waterLevel: 'No standing water reported.',
        photoUrl: 'https://placehold.co/960x640/png?text=Slope+Update',
        photoLabel: 'Volunteer slope photo',
        confirmedAtLabel: '12m ago'
      }
    ],
    timeline: [
      {
        id: 'pana-event-1',
        title: 'Report submitted',
        detail: 'Original landslide report entered the queue.',
        timeLabel: '55m ago',
        icon: 'document-text-outline'
      },
      {
        id: 'pana-event-2',
        title: 'Photo added',
        detail: 'Resident photo evidence showed mud over the uphill track.',
        timeLabel: '50m ago',
        icon: 'camera-outline'
      },
      {
        id: 'pana-event-3',
        title: 'Volunteer field update',
        detail: 'Volunteer documented the slope condition and blocked path.',
        timeLabel: '12m ago',
        icon: 'create-outline'
      }
    ],
    checklist: {
      locationConfirmed: true,
      timeValid: true,
      multipleReports: true,
      photoEvidence: true,
      fieldUpdate: true
    }
  },
  {
    id: 'market-circle-drain',
    hazardType: 'OTHER',
    hazardLabel: hazardLabelForOfficer('OTHER'),
    severity: 'LOW',
    status: 'PENDING',
    statusLabel: statusLabelForOfficer('PENDING'),
    locationLabel: 'Market Circle, Matara',
    latestUpdateLabel: '6m ago',
    communityReportsCount: 3,
    communityReportsLabel: formatCommunityReportsLabel(3),
    descriptionPreview: 'Drain overflow and debris are creating a localized issue near the market entrance.',
    searchText: 'market circle matara drain overflow debris market entrance',
    tone: hazardToneForOfficer('OTHER'),
    icon: 'alert-circle-outline',
    href: '/officer/reports/market-circle-drain',
    reportedTimeLabel: '20m ago',
    residentDescription:
      'Residents noted a localized overflow and debris buildup near the market entrance that is affecting pedestrians and small vehicles.',
    residentPhotoUrl: 'https://placehold.co/960x640/png?text=Drain+Overflow',
    residentPhotoLabel: 'Resident overflow photo',
    locationDetails: 'Recorded at the market entrance drainage channel and the nearby curb line.',
    relatedReportsCount: 3,
    relatedReportsLabel: formatCommunityReportsLabel(3),
    volunteerEvidence: [],
    timeline: [
      {
        id: 'market-event-1',
        title: 'Report submitted',
        detail: 'Pending report entered the queue with a location pin at the market circle.',
        timeLabel: '20m ago',
        icon: 'document-text-outline'
      },
      {
        id: 'market-event-2',
        title: 'Photo added',
        detail: 'Resident attached a photo of the overflowed drain.',
        timeLabel: '18m ago',
        icon: 'camera-outline'
      }
    ],
    checklist: {
      locationConfirmed: true,
      timeValid: true,
      multipleReports: false,
      photoEvidence: true,
      fieldUpdate: false
    }
  }
];

export const officerGroupedReportSummaries: OfficerGroupedReportSummary[] = officerReportReviewFixtures.map(
  toOfficerGroupedReportSummary
);

export function getOfficerReportReviewRecord(reportId: string) {
  return officerReportReviewFixtures.find((report) => report.id === reportId) ?? null;
}

export function toOfficerGroupedReportSummary(report: OfficerReportReviewRecord): OfficerGroupedReportSummary {
  return {
    id: report.id,
    hazardType: report.hazardType,
    hazardLabel: report.hazardLabel,
    severity: report.severity,
    status: report.status,
    statusLabel: report.statusLabel,
    locationLabel: report.locationLabel,
    latestUpdateLabel: report.latestUpdateLabel,
    communityReportsCount: report.communityReportsCount,
    communityReportsLabel: report.communityReportsLabel,
    descriptionPreview: report.descriptionPreview,
    searchText: report.searchText,
    tone: report.tone,
    icon: report.icon,
    href: report.href
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

    if (!normalizedSearch) {
      return true;
    }

    return report.searchText.toLowerCase().includes(normalizedSearch);
  });
}

export function formatOfficerReportSearchSummary(count: number) {
  return `${count} pending group${count === 1 ? '' : 's'} match your filters`;
}
