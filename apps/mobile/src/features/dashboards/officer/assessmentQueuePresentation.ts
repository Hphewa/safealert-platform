import type { IncidentWithReportsResponse } from '@safealert/contracts';
import { formatOperationalTime } from '../shared/formatOperationalTime';

export type AssessmentQueueFilter = {
  hazardType: string | null;
  label: string;
  count: number;
};

export function formatAssessmentHazard(value: string) {
  return value.toLowerCase().split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
}

export function formatAssessmentRelativeTime(value: string, now = Date.now()) {
  return formatOperationalTime(value, now);
}

export function assessmentQueueFilters(
  incidents: IncidentWithReportsResponse[],
  selectedHazard: string | null
): { selectedHazard: string | null; options: AssessmentQueueFilter[] } {
  const counts = new Map<string, number>();
  for (const item of incidents) {
    counts.set(item.incident.hazardType, (counts.get(item.incident.hazardType) ?? 0) + 1);
  }
  const options: AssessmentQueueFilter[] = [
    { hazardType: null, label: 'All', count: incidents.length },
    ...Array.from(counts, ([hazardType, count]) => ({ hazardType, label: formatAssessmentHazard(hazardType), count }))
  ];
  return {
    selectedHazard: selectedHazard && counts.has(selectedHazard) ? selectedHazard : null,
    options
  };
}

export function filterAssessmentQueue(incidents: IncidentWithReportsResponse[], hazardType: string | null) {
  return hazardType ? incidents.filter((item) => item.incident.hazardType === hazardType) : incidents;
}
