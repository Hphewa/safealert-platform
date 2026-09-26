import type { BottomNavItem, PlaceholderConfig } from '../shared/types';

export const officerBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/officer', icon: 'home-outline' },
  { label: 'Reports', href: '/officer/reports', icon: 'document-text-outline' },
  { label: 'Assessments', href: '/officer/assessments', icon: 'shield-checkmark-outline' }
];

export const officerPlaceholderContent: Record<string, PlaceholderConfig> = {
  reports: {
    title: 'Review Reports',
    description: 'Open Pending Reports to review real resident hazard reports.'
  }
};
