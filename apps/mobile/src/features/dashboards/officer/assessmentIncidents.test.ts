import type { IncidentWithReportsResponse } from '@safealert/contracts';
import { expect, it } from 'vitest';

import { latestIncidentReportAt } from './assessmentIncidents';

const incident: IncidentWithReportsResponse = {
  incident: {
    id: 'incident-1',
    hazardType: 'FLOOD',
    location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds: ['report-1', 'report-2'],
    status: 'ACTIVE',
    createdById: 'officer-1',
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T11:00:00.000Z'
  },
  reports: [
    {
      id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', description: 'First observation', severity: 'HIGH',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] }, status: 'VERIFIED',
      createdAt: '2026-09-25T10:00:00.000Z', updatedAt: '2026-09-25T10:05:00.000Z'
    },
    {
      id: 'report-2', residentId: 'resident-2', hazardType: 'FLOOD', description: 'Later observation', severity: 'MODERATE',
      location: { type: 'Point', coordinates: [79.862, 6.928] }, status: 'VERIFIED',
      createdAt: '2026-09-25T11:00:00.000Z', updatedAt: '2026-09-25T11:05:00.000Z'
    }
  ]
};

it('represents one incident once and uses the latest member report time', () => {
  expect(latestIncidentReportAt(incident)).toBe('2026-09-25T11:00:00.000Z');
});

