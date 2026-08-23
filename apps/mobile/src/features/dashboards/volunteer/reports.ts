import type { ReportStatus, RiskLevel } from '@safealert/contracts';
import type { Href } from 'expo-router';

import type { DashboardIconName } from '../shared/types';

export type VolunteerReportListKey = 'nearby' | 'incoming';

export type VolunteerCommunityReport = {
  id: string;
  hazardType: string;
  severity: RiskLevel;
  location: string;
  reportedTime: string;
  reportedDateTime: string;
  distanceLabel?: string;
  descriptionPreview?: string;
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

export const volunteerCommunityReportsMockData: Record<
  VolunteerReportListKey,
  VolunteerCommunityReport[]
> = {
  nearby: [
    {
      id: 'nearby-1',
      hazardType: 'Flood Water Rising',
      severity: 'HIGH',
      location: 'Riverside Road',
      distanceLabel: '0.8 km away',
      reportedTime: '10 min ago',
      reportedDateTime: 'Today at 8:40 PM',
      descriptionPreview: 'Water is moving across the road shoulder and edging toward nearby homes.',
      description:
        'Residents reported flood water rising quickly along the edge of Riverside Road and beginning to spread toward nearby front steps.',
      status: 'PENDING',
      mediaUrl: 'https://placehold.co/960x640/png?text=Flood+Evidence',
      icon: 'water-outline'
      ,
      href: '/volunteer/reports/nearby-1'
    },
    {
      id: 'nearby-2',
      hazardType: 'Tree Blocking Main Lane',
      severity: 'MODERATE',
      location: 'Maple Avenue',
      distanceLabel: '1.3 km away',
      reportedTime: '18 min ago',
      reportedDateTime: 'Today at 8:32 PM',
      descriptionPreview: 'A fallen branch is blocking one lane and slowing neighborhood traffic.',
      description:
        'A large branch came down after heavy wind and is blocking one side of Maple Avenue, forcing vehicles to alternate carefully.',
      status: 'PENDING',
      icon: 'leaf-outline'
      ,
      href: '/volunteer/reports/nearby-2'
    },
    {
      id: 'nearby-3',
      hazardType: 'Drain Overflow Reported',
      severity: 'LOW',
      location: 'Canal Street',
      distanceLabel: '2.0 km away',
      reportedTime: '27 min ago',
      reportedDateTime: 'Today at 8:23 PM',
      descriptionPreview: 'Residents reported water bubbling up from a drain after steady rain.',
      description:
        'Water is bubbling up through a roadside drain and beginning to pool around the corner near the pedestrian crossing.',
      status: 'PENDING',
      icon: 'rainy-outline'
      ,
      href: '/volunteer/reports/nearby-3'
    }
  ],
  incoming: [
    {
      id: 'incoming-1',
      hazardType: 'Flash Flood Warning',
      severity: 'HIGH',
      location: 'Lake View Junction',
      reportedTime: '4 min ago',
      reportedDateTime: 'Today at 8:46 PM',
      descriptionPreview: 'Several callers reported fast-rising water near the market entrance.',
      description:
        'Multiple residents reported fast-rising water near the market entrance at Lake View Junction with traffic starting to back up.',
      status: 'PENDING',
      mediaUrl: 'https://placehold.co/960x640/png?text=Incoming+Flood+Report',
      icon: 'flash-outline'
      ,
      href: '/volunteer/reports/incoming-1'
    },
    {
      id: 'incoming-2',
      hazardType: 'Road Shoulder Collapse',
      severity: 'MODERATE',
      location: 'Temple Approach Road',
      distanceLabel: '3.1 km away',
      reportedTime: '12 min ago',
      reportedDateTime: 'Today at 8:38 PM',
      descriptionPreview: 'A roadside edge gave way after heavy runoff and now needs confirmation.',
      description:
        'The shoulder on Temple Approach Road appears to have given way after runoff, leaving a narrow and unstable edge beside the lane.',
      status: 'PENDING',
      icon: 'trail-sign-outline'
      ,
      href: '/volunteer/reports/incoming-2'
    },
    {
      id: 'incoming-3',
      hazardType: 'Minor Waterlogging',
      severity: 'LOW',
      location: 'Community Hall Lane',
      distanceLabel: '4.6 km away',
      reportedTime: '21 min ago',
      reportedDateTime: 'Today at 8:29 PM',
      descriptionPreview: 'Standing water is collecting near the hall entrance after a short storm.',
      description:
        'Standing water is collecting near the entrance to the community hall and residents want confirmation before it worsens.',
      status: 'PENDING',
      icon: 'time-outline'
      ,
      href: '/volunteer/reports/incoming-3'
    }
  ]
};

export const volunteerCommunityReports = [
  ...volunteerCommunityReportsMockData.nearby,
  ...volunteerCommunityReportsMockData.incoming
];

export function getVolunteerCommunityReportById(reportId: string) {
  return volunteerCommunityReports.find((report) => report.id === reportId) ?? null;
}
