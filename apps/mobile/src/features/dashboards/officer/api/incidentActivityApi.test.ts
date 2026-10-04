import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../../../services/api/client';
import { getIncidentActivityTimeline } from './incidentActivityApi';

vi.mock('../../../../services/api/client', () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('getIncidentActivityTimeline', () => {
  it('uses the officer incident timeline endpoint with the authenticated request abstraction', async () => {
    const response = { incidentId: 'incident/1', events: [] };
    vi.mocked(apiRequest).mockResolvedValue(response);
    await expect(getIncidentActivityTimeline('incident/1', 'officer-token')).resolves.toEqual(response);
    expect(apiRequest).toHaveBeenCalledWith('/incidents/incident%2F1/timeline', { accessToken: 'officer-token' });
  });
});
