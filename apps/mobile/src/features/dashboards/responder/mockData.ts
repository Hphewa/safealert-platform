import type {
  BottomNavItem,
  PlaceholderConfig,
  ResponderRequestPreview
} from '../shared/types';

export const responderBottomNavItems: BottomNavItem[] = [
  { label: 'Requests', href: '/responder', icon: 'list-outline' },
  { label: 'Active', href: '/responder/active', icon: 'flash-outline' },
  { label: 'Map', href: '/responder/map', icon: 'map-outline' },
  { label: 'History', href: '/responder/history', icon: 'time-outline' },
  { label: 'Profile', href: '/responder/profile', icon: 'person-outline' }
];

export const responderRequests: ResponderRequestPreview[] = [
  {
    id: 'request-1',
    priority: 'CRITICAL',
    emergencyType: 'Flood Assistance',
    location: 'Riverside Road',
    peopleAffected: 4,
    injuredCount: 1,
    distanceLabel: '2.4 km away',
    reportedTime: '2 min ago',
    status: 'PENDING',
    icon: 'rainy-outline',
    href: '/responder/request-details'
  },
  {
    id: 'request-2',
    priority: 'HIGH',
    emergencyType: 'Evacuation Assistance',
    location: 'Lake Road',
    peopleAffected: 2,
    injuredCount: 0,
    distanceLabel: '3.1 km away',
    reportedTime: '7 min ago',
    status: 'PENDING',
    icon: 'bus-outline',
    href: '/responder/request-details'
  },
  {
    id: 'request-3',
    priority: 'MODERATE',
    emergencyType: 'Blocked House Access',
    location: 'School Road',
    peopleAffected: 1,
    injuredCount: 0,
    distanceLabel: '4.5 km away',
    reportedTime: '15 min ago',
    status: 'PENDING',
    icon: 'trail-sign-outline',
    href: '/responder/request-details'
  },
  {
    id: 'request-4',
    priority: 'LOW',
    emergencyType: 'Water Leakage',
    location: 'Temple Road',
    peopleAffected: 2,
    injuredCount: 0,
    distanceLabel: '6.2 km away',
    reportedTime: '28 min ago',
    status: 'ASSIGNED',
    icon: 'water-outline',
    href: '/responder/request-details'
  },
  {
    id: 'request-5',
    priority: 'HIGH',
    emergencyType: 'Medical Transport',
    location: 'Bridge Street',
    peopleAffected: 1,
    injuredCount: 1,
    distanceLabel: '5.0 km away',
    reportedTime: '11 min ago',
    status: 'ASSIGNED',
    icon: 'medical-outline',
    href: '/responder/request-details'
  }
];

export const responderPlaceholderContent: Record<string, PlaceholderConfig> = {
  active: {
    title: 'Active Responses',
    description: 'Responder dispatch and active request workflows will be implemented here later.'
  },
  map: {
    title: 'Responder Map',
    description: 'Live maps, routing, and GPS-assisted response views are planned for a later task.'
  },
  history: {
    title: 'Request History',
    description: 'Historical response logs and completed request details will appear here soon.'
  },
  profile: {
    title: 'Responder Profile',
    description: 'Responder account settings and shift preferences will live here soon.'
  },
  'request-details': {
    title: 'Request Details',
    description: 'Detailed request review and assignment actions will be added here later.'
  }
};
