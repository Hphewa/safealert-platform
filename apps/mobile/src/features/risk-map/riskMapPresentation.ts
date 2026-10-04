import type { RiskLevel, RiskMapIncident } from '@safealert/contracts';
import { dashboardTheme } from '../dashboards/shared/theme';

// Map-specific: existing badges elsewhere intentionally keep their current palette.
export const riskMapPresentation: Record<RiskLevel, { label: string; color: string }> = {
  LOW: { label: 'Low', color: dashboardTheme.colors.low },
  MODERATE: { label: 'Medium', color: dashboardTheme.colors.moderate },
  HIGH: { label: 'High', color: dashboardTheme.colors.high },
  CRITICAL: { label: 'Critical', color: dashboardTheme.colors.critical }
};
export type RiskMapFilter = 'ALL' | RiskLevel;
export const riskMapFilters: RiskMapFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW'];
export function filterRiskMapIncidents<T extends RiskMapIncident>(incidents: T[], filter: RiskMapFilter): T[] {
  return filter === 'ALL' ? incidents : incidents.filter((incident) => incident.riskLevel === filter);
}
export function riskMapHazard(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}
