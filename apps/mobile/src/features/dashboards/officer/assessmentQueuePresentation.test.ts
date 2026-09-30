import { expect, it } from 'vitest';
import type { IncidentWithReportsResponse } from '@safealert/contracts';

import {
  assessmentQueueFilters,
  filterAssessmentQueue,
  formatAssessmentHazard,
  formatAssessmentRelativeTime
} from './assessmentQueuePresentation';

const incident = (hazardType: IncidentWithReportsResponse['incident']['hazardType'], id: string): IncidentWithReportsResponse => ({
  incident: {
    id, hazardType, location: { type: 'Point', coordinates: [79.86, 6.92] }, reportIds: [],
    status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:00:00.000Z'
  },
  reports: []
});

const queue = [incident('FLOOD', 'one'), incident('FLOOD', 'two'), incident('LANDSLIDE', 'three')];

it('formats stored hazard enums as readable title case', () => {
  expect(formatAssessmentHazard('FLOOD')).toBe('Flood');
  expect(formatAssessmentHazard('BLOCKED_ROAD')).toBe('Blocked Road');
  expect(formatAssessmentHazard('OTHER')).toBe('Other');
});

it('builds counted filters from queue hazards and falls back to All if a hazard disappears', () => {
  expect(assessmentQueueFilters(queue, 'FLOOD')).toEqual({
    selectedHazard: 'FLOOD',
    options: [
      { hazardType: null, label: 'All', count: 3 },
      { hazardType: 'FLOOD', label: 'Flood', count: 2 },
      { hazardType: 'LANDSLIDE', label: 'Landslide', count: 1 }
    ]
  });
  expect(assessmentQueueFilters([queue[2]], 'FLOOD').selectedHazard).toBeNull();
  expect(filterAssessmentQueue(queue, 'FLOOD').map((item) => item.incident.id)).toEqual(['one', 'two']);
  expect(filterAssessmentQueue(queue, 'VOLCANO')).toEqual([]);
});

it('formats relative latest-report time at minute, hour, day, and invalid boundaries', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z');
  expect(formatAssessmentRelativeTime('2026-09-30T11:55:00.000Z', now)).toBe('Updated 5 min ago');
  expect(formatAssessmentRelativeTime('2026-09-30T10:00:00.000Z', now)).toBe('Updated 2 hr ago');
  expect(formatAssessmentRelativeTime('2026-09-29T12:00:00.000Z', now)).toBe('Updated yesterday');
  expect(formatAssessmentRelativeTime('2026-09-26T12:00:00.000Z', now)).toBe('Updated 4 days ago');
  expect(formatAssessmentRelativeTime('', now)).toBe('Time unavailable');
});
