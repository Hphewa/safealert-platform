import type { IncidentActivityTimelineResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';

export function getIncidentActivityTimeline(incidentId: string, accessToken: string) {
  return apiRequest<IncidentActivityTimelineResponse>(
    `/incidents/${encodeURIComponent(incidentId)}/timeline`, { accessToken }
  );
}
