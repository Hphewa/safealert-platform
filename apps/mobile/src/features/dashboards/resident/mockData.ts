import type { Href } from 'expo-router';

import type { BottomNavItem, PlaceholderConfig, QuickAction } from '../shared/types';

export const residentBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/resident', icon: 'home-outline' },
  { label: 'Alerts', href: '/resident/alerts', icon: 'notifications-outline' },
  { label: 'Reports', href: '/resident/reports', icon: 'document-text-outline' },
  { label: 'Profile', href: '/resident/profile', icon: 'person-outline' }
];

export const residentPrimaryActions: QuickAction[] = [
  {
    title: 'Report Hazard',
    subtitle: 'Report a danger near you',
    href: '/resident/report-hazard',
    icon: 'warning-outline'
  },
  {
    title: 'Notifications & Notices',
    subtitle: 'See the latest advisories and community notices',
    href: '/resident/alerts',
    icon: 'notifications-outline'
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

export const residentWeatherPreview = {
  condition: 'Heavy Rain',
  advisory: 'Stay alert and take care.',
  locationLabel: 'Riverbend community',
  href: '/resident/local-conditions' as Href
};

export const residentNotificationCount = 3;

export const residentPlaceholderContent: Record<string, PlaceholderConfig> = {
  alerts: {
    title: 'Notifications & Notices',
    description: 'Resident alerts, warnings, and public notices will appear here soon.'
  },
  reports: {
    title: 'Report Status & Reviews',
    description: 'Your submitted hazard reports and review timelines will appear here soon.'
  },
  profile: {
    title: 'Resident Profile',
    description: 'Account details, preferences, and resident settings will live here soon.'
  },
  'report-hazard': {
    title: 'Report Hazard',
    description: 'The resident hazard reporting workflow will be added in the next implementation step.'
  },
  help: {
    title: 'Help / Emergency Assistance',
    description: 'Emergency support, assistance requests, and helpful contacts will appear here soon.'
  },
  'local-conditions': {
    title: 'Local Conditions',
    description: 'Weather conditions and local safety updates will be connected here later.'
  }
};
