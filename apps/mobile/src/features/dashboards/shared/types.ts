import type { RiskLevel, ReportStatus } from '@safealert/contracts';
import type { Href } from 'expo-router';

export type DashboardIconName = string;

export type BottomNavItem = {
  label: string;
  href: Href;
  icon: DashboardIconName;
};

export type PlaceholderConfig = {
  title: string;
  description: string;
};

export type SummaryStat = {
  label: string;
  value: number | string;
  icon: DashboardIconName;
  tone?: BadgeTone;
};

export type QuickAction = {
  title: string;
  subtitle?: string;
  href: Href;
  icon: DashboardIconName;
};

export type ReportPreview = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  icon: DashboardIconName;
  href: Href;
  severity?: RiskLevel;
  detailItems?: string[];
};

export type ResponderRequestPreview = {
  id: string;
  priority: RiskLevel;
  emergencyType: string;
  location: string;
  peopleAffected: number;
  injuredCount: number;
  distanceLabel: string;
  reportedTime: string;
  status: 'PENDING' | 'ASSIGNED';
  icon: DashboardIconName;
  href: Href;
};

export type BadgeTone =
  | 'critical'
  | 'high'
  | 'moderate'
  | 'low'
  | 'info'
  | 'success'
  | 'neutral';

export type StatusSummary = {
  label: ReportStatus;
  count: number;
};
