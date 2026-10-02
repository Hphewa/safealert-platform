import type { BottomNavItem, QuickAction } from '../shared/types';

export const residentBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/resident', icon: 'home-outline' },
  { label: 'Report', href: '/resident/report-hazard?mode=new', icon: 'warning-outline' },
  { label: 'Reports', href: '/resident/reports', icon: 'document-text-outline' },
  { label: 'Help', href: '/resident/help', icon: 'help-buoy-outline' },
  { label: 'Profile', href: '/resident/notification-profile', icon: 'person-circle-outline' }
];

export const residentPrimaryActions: QuickAction[] = [
  {
    title: 'Report Hazard',
    subtitle: 'Report a danger near you',
    href: '/resident/report-hazard',
    icon: 'warning-outline'
  },
  {
    title: 'My Reports',
    subtitle: 'Track reviews and updates for your recent reports',
    href: '/resident/reports',
    icon: 'checkmark-done-outline'
  },
  {
    title: 'Emergency Requests',
    subtitle: 'Request urgent help and track assistance',
    href: '/resident/help',
    icon: 'help-buoy-outline'
  }
];

