import type { BottomNavItem, QuickAction } from '../shared/types';

export const officerBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/officer', icon: 'home-outline' },
  { label: 'Reports', href: '/officer/reports', icon: 'document-text-outline' },
  { label: 'Assessments', href: '/officer/assessments', icon: 'shield-checkmark-outline' },
  { label: 'Monitoring', href: '/officer/monitoring', icon: 'eye-outline' },
  { label: 'Warnings', href: '/officer/warnings', icon: 'warning-outline' }
];

export const officerQuickActions: QuickAction[] = [
  {
    title: 'Review Reports', subtitle: 'Open the latest incoming reports',
    href: '/officer/reports', icon: 'reader-outline'
  },
  {
    title: 'Assess Risk', subtitle: 'Assess a verified hazard report',
    href: '/officer/assessments', icon: 'speedometer-outline'
  },
  {
    title: 'Group Incidents', subtitle: 'Review verified reports for related incidents',
    href: '/officer/incidents', icon: 'git-branch-outline'
  },
  {
    title: 'Monitoring', subtitle: 'Open monitoring',
    href: '/officer/monitoring', icon: 'eye-outline'
  }
];
