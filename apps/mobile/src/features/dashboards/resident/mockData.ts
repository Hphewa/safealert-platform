import type { BottomNavItem, QuickAction } from '../shared/types';

export const residentBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/resident', icon: 'home-outline' },
  { label: 'Report', href: '/resident/report-hazard', icon: 'warning-outline' },
  { label: 'Reports', href: '/resident/reports', icon: 'document-text-outline' },
  { label: 'Help', href: '/resident/help', icon: 'help-buoy-outline' },
  { label: 'Profile', href: '/resident/notification-profile', icon: 'person-outline' }
];

export const residentPrimaryActions: QuickAction[] = [
  {
    title: 'Report Hazard',
    subtitle: 'Report a danger near you',
    href: '/resident/report-hazard',
    icon: 'warning-outline'
  },
  {
    title: 'Report Status & Reviews',
    subtitle: 'Track reviews and updates for your recent reports',
    href: '/resident/reports',
    icon: 'checkmark-done-outline'
  },
  {
    title: 'Help / Emergency Assistance',
    subtitle: 'Request urgent help and share your current situation',
    href: '/resident/help',
    icon: 'help-buoy-outline'
  }
];

