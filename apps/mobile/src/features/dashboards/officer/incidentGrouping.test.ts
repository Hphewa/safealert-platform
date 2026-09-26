import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../../../services/api/client';
import {
  formatIncidentDistance,
  formatIncidentLocation,
  formatIncidentTime,
  incidentGroupingErrorMessage
} from './incidentGrouping';

describe('incident grouping presentation', () => {
  it('formats candidate location and distance for officer review', () => {
    expect(formatIncidentLocation({ type: 'Point', coordinates: [79.861234, 6.927891] })).toBe('6.92789, 79.86123');
    expect(formatIncidentDistance(240)).toBe('240 m away');
    expect(formatIncidentDistance(1250)).toBe('1.3 km away');
  });

  it('handles unavailable candidate timestamps without crashing the decision screen', () => {
    expect(formatIncidentTime('not-a-date')).toBe('Time unavailable');
    expect(formatIncidentTime('2026-09-25T10:30:00.000Z')).not.toBe('Time unavailable');
  });

  it('maps grouping conflicts and network failures to actionable messages', () => {
    expect(incidentGroupingErrorMessage(new ApiClientError(409, 'ACTIVE_INCIDENT_EXISTS', 'raw conflict')))
      .toMatch(/already assigned/i);
    expect(incidentGroupingErrorMessage(new ApiClientError(0, 'NETWORK_ERROR', 'raw network')))
      .toMatch(/connection/i);
    expect(incidentGroupingErrorMessage(new Error('Unexpected failure'))).toBe('Unexpected failure');
  });
});
