import type { RiskLevel, RiskMapIncident } from '@safealert/contracts';

// Map-specific: existing badges elsewhere intentionally keep their current palette.
export const riskMapPresentation: Record<RiskLevel, { label: string; color: string }> = {
  LOW: { label: 'Low', color: '#16a34a' },
  MODERATE: { label: 'Medium', color: '#eab308' },
  HIGH: { label: 'High', color: '#f97316' },
  CRITICAL: { label: 'Critical', color: '#dc2626' }
};
export type RiskMapFilter = 'ALL' | RiskLevel;
export const riskMapFilters: RiskMapFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW'];
export function filterRiskMapIncidents<T extends RiskMapIncident>(incidents: T[], filter: RiskMapFilter): T[] {
  return filter === 'ALL' ? incidents : incidents.filter((incident) => incident.riskLevel === filter);
}
export function riskMapHazard(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}
