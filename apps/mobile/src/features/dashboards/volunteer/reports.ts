import type { RiskLevel } from '@safealert/contracts';

import type { DashboardIconName } from '../shared/types';

export type VolunteerReportListKey = 'nearby' | 'incoming';

export type VolunteerCommunityReport = {
  id: string;
  hazardType: string;
  severity: RiskLevel;
  location: string;
  reportedTime: string;
  distanceLabel?: string;
  descriptionPreview?: string;
  icon: DashboardIconName;
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
      descriptionPreview: 'Water is moving across the road shoulder and edging toward nearby homes.',
      icon: 'water-outline'
    },
    {
      id: 'nearby-2',
      hazardType: 'Tree Blocking Main Lane',
      severity: 'MODERATE',
      location: 'Maple Avenue',
      distanceLabel: '1.3 km away',
      reportedTime: '18 min ago',
      descriptionPreview: 'A fallen branch is blocking one lane and slowing neighborhood traffic.',
      icon: 'leaf-outline'
    },
    {
      id: 'nearby-3',
      hazardType: 'Drain Overflow Reported',
      severity: 'LOW',
      location: 'Canal Street',
      distanceLabel: '2.0 km away',
      reportedTime: '27 min ago',
      descriptionPreview: 'Residents reported water bubbling up from a drain after steady rain.',
      icon: 'rainy-outline'
    }
  ],
  incoming: [
    {
      id: 'incoming-1',
      hazardType: 'Flash Flood Warning',
      severity: 'HIGH',
      location: 'Lake View Junction',
      reportedTime: '4 min ago',
      descriptionPreview: 'Several callers reported fast-rising water near the market entrance.',
      icon: 'flash-outline'
    },
    {
      id: 'incoming-2',
      hazardType: 'Road Shoulder Collapse',
      severity: 'MODERATE',
      location: 'Temple Approach Road',
      distanceLabel: '3.1 km away',
      reportedTime: '12 min ago',
      descriptionPreview: 'A roadside edge gave way after heavy runoff and now needs confirmation.',
      icon: 'trail-sign-outline'
    },
    {
      id: 'incoming-3',
      hazardType: 'Minor Waterlogging',
      severity: 'LOW',
      location: 'Community Hall Lane',
      distanceLabel: '4.6 km away',
      reportedTime: '21 min ago',
      descriptionPreview: 'Standing water is collecting near the hall entrance after a short storm.',
      icon: 'time-outline'
    }
  ]
};
