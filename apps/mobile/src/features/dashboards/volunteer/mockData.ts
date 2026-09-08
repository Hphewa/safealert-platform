import type { BottomNavItem, PlaceholderConfig, QuickAction, ReportPreview, SummaryStat } from '../shared/types';

export const volunteerBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/volunteer', icon: 'home-outline' },
  { label: 'Nearby', href: '/volunteer/nearby', icon: 'locate-outline' },
  { label: 'Confirmations', href: '/volunteer/confirmations', icon: 'checkmark-done-outline' },
  { label: 'Map', href: '/volunteer/map', icon: 'map-outline' },
  { label: 'Profile', href: '/volunteer/profile', icon: 'person-outline' }
];

export const volunteerSummaryStats: SummaryStat[] = [
  { label: 'Nearby Reports', value: 9, icon: 'locate-outline', tone: 'info' },
  { label: 'Needs Confirmation', value: 5, icon: 'help-circle-outline', tone: 'moderate' },
  { label: 'My Confirmations', value: 11, icon: 'checkmark-done-outline', tone: 'success' },
  { label: 'Urgent Nearby', value: 2, icon: 'alert-circle-outline', tone: 'critical' }
];

export const volunteerNearbyReports: ReportPreview[] = [
  {
    id: 'nearby-1',
    title: 'Flood Water Rising',
    subtitle: 'Riverside Road',
    timeLabel: '',
    icon: 'water-outline',
    href: '/volunteer/nearby',
    severity: 'HIGH',
    detailItems: ['0.8 km away', '10 min ago']
  },
  {
    id: 'nearby-2',
    title: 'Tree Blocking Main Lane',
    subtitle: 'Maple Avenue',
    timeLabel: '',
    icon: 'leaf-outline',
    href: '/volunteer/nearby',
    severity: 'MODERATE',
    detailItems: ['1.3 km away', '18 min ago']
  },
  {
    id: 'nearby-3',
    title: 'Drain Overflow Reported',
    subtitle: 'Canal Street',
    timeLabel: '',
    icon: 'rainy-outline',
    href: '/volunteer/nearby',
    severity: 'LOW',
    detailItems: ['2.0 km away', '27 min ago']
  }
];

export const volunteerQuickActions: QuickAction[] = [
  {
    title: 'Nearby Reports',
    subtitle: 'See reports near your location',
    href: '/volunteer/nearby',
    icon: 'locate-outline'
  },
  {
    title: 'My Confirmations',
    subtitle: 'Review your submitted field checks',
    href: '/volunteer/confirmations',
    icon: 'checkmark-done-outline'
  },
  {
    title: 'Field Guide',
    subtitle: 'Open volunteer safety guidance',
    href: '/volunteer/field-guide',
    icon: 'book-outline'
  }
];

export const volunteerPlaceholderContent: Record<string, PlaceholderConfig> = {
  nearby: {
    title: 'Nearby Reports',
    description: 'Volunteer report browsing and confirmation details will be added here later.'
  },
  confirmations: {
    title: 'My Confirmations',
    description: 'Your field confirmations and review history will appear here soon.'
  },
  map: {
    title: 'Volunteer Map',
    description: 'Map-based volunteer navigation and nearby incident views are planned for a later step.'
  },
  profile: {
    title: 'Volunteer Profile',
    description: 'Volunteer profile settings and availability controls will live here soon.'
  },
  'field-guide': {
    title: 'Field Guide',
    description: 'Volunteer safety guidance and field verification tips will be added here soon.'
  }
};
