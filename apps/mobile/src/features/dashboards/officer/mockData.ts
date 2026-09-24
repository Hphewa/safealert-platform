import type { BottomNavItem, PlaceholderConfig, QuickAction, ReportPreview, SummaryStat } from '../shared/types';

export const officerBottomNavItems: BottomNavItem[] = [
  { label: 'Home', href: '/officer', icon: 'home-outline' },
  { label: 'Reports', href: '/officer/reports', icon: 'document-text-outline' },
  { label: 'Assessments', href: '/officer/assessments', icon: 'shield-checkmark-outline' },
  { label: 'Monitoring', href: '/officer/monitoring', icon: 'eye-outline' },
  { label: 'Profile', href: '/officer/profile', icon: 'person-outline' }
];

export const officerSummaryStats: SummaryStat[] = [
  { label: 'Pending Reports', value: 18, icon: 'document-text-outline', tone: 'info' },
  { label: 'Field Updates', value: 12, icon: 'create-outline', tone: 'moderate' },
  { label: 'Verified Today', value: 7, icon: 'shield-checkmark-outline', tone: 'success' },
  { label: 'Active Incidents', value: 3, icon: 'alert-circle-outline', tone: 'critical' }
];

export const officerLatestReports: ReportPreview[] = [
  {
    id: 'report-1',
    title: 'Flooding in Riverbend Area',
    subtitle: 'Riverbend, Sector 3',
    timeLabel: '2h ago',
    icon: 'water-outline',
    href: '/officer/reports'
  },
  {
    id: 'report-2',
    title: 'Road Blocked by Landslide',
    subtitle: 'Hillview, Sector 7',
    timeLabel: '4h ago',
    icon: 'trail-sign-outline',
    href: '/officer/reports'
  },
  {
    id: 'report-3',
    title: 'Small Fire Reported',
    subtitle: 'Greenfield, Sector 2',
    timeLabel: '6h ago',
    icon: 'flame-outline',
    href: '/officer/reports'
  }
];

export const officerQuickActions: QuickAction[] = [
  {
    title: 'Review Reports',
    subtitle: 'Open the latest incoming reports',
    href: '/officer/reports',
    icon: 'reader-outline'
  },
  {
    title: 'Assess Risk',
    subtitle: 'Assess a verified hazard report',
    href: '/officer/assessments',
    icon: 'speedometer-outline'
  },
  {
    title: 'Monitoring',
    subtitle: 'Check active monitoring queues',
    href: '/officer/monitoring',
    icon: 'eye-outline'
  }
];

export const officerPlaceholderContent: Record<string, PlaceholderConfig> = {
  reports: {
    title: 'Review Reports',
    description: 'Detailed officer report review and triage tools will be added here later.'
  },
  monitoring: {
    title: 'Monitoring',
    description: 'Incident monitoring dashboards and live feeds will appear here soon.'
  },
  profile: {
    title: 'Officer Profile',
    description: 'Officer account preferences and profile settings will live here soon.'
  }
};
