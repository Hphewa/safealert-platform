import { beforeEach, expect, it, vi } from 'vitest';
import type { RiskAssessmentForIncidentResponse } from '@safealert/contracts';
const api = vi.hoisted(() => ({ context: vi.fn(), queue: vi.fn() }));
vi.mock('./riskAssessmentApi', () => ({ getRiskAssessmentForIncident: api.context }));
vi.mock('./incidentApi', () => ({ listInitialAssessmentQueue: api.queue }));
import { loadIncidentOverview, NO_VERIFIED_INCIDENT_EVIDENCE } from './incidentOverview';
import { ApiClientError } from '../../../../services/api/client';

const context: RiskAssessmentForIncidentResponse = {
  assessment: null,
  incident: { id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [80, 7] },
    reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-25', updatedAt: '2026-09-25' },
  reports: [{ id: 'report-1', residentId: 'resident-1', hazardType: 'FLOOD', severity: 'HIGH', description: 'Flooding',
    location: { type: 'Point', coordinates: [80, 7] }, status: 'VERIFIED', createdAt: '2026-09-25', updatedAt: '2026-09-25' }]
};
beforeEach(() => {
  api.context.mockReset().mockResolvedValue(context);
  api.queue.mockReset().mockResolvedValue({ incidents: [{ incident: context.incident, reports: context.reports }] });
});
it('loads context through the existing API and confirms backend queue membership', async () => {
  await expect(loadIncidentOverview('incident-1', 'token')).resolves.toMatchObject({ ...context, canStartInitialAssessment: true });
  expect(api.context).toHaveBeenCalledWith('incident-1', 'token');
  expect(api.queue).toHaveBeenCalledWith('token');
});
it('blocks an incident removed from the initial queue even when no active assessment is returned', async () => {
  api.queue.mockResolvedValue({ incidents: [] });
  expect((await loadIncidentOverview('incident-1', 'token')).canStartInitialAssessment).toBe(false);
});
it.each([
  { ...context, assessment: { id: 'assessment-1' } },
  { ...context, incident: { ...context.incident, status: 'CLOSED' } },
  { ...context, reports: [] },
  { ...context, reports: [{ ...context.reports[0], status: 'PENDING' }] }
])('blocks initial assessment for ineligible returned context', async (result) => {
  api.context.mockResolvedValue(result);
  expect((await loadIncidentOverview('incident-1', 'token')).canStartInitialAssessment).toBe(false);
});
it('rejects a response for a different incident', async () => {
  await expect(loadIncidentOverview('incident-other', 'token')).rejects.toThrow();
});
it('does not treat a failed eligibility lookup as eligible', async () => {
  api.queue.mockRejectedValue(new Error('Offline'));
  await expect(loadIncidentOverview('incident-1', 'token')).rejects.toThrow('Offline');
});
it('handles backend rejection of an incident without verified evidence explicitly', async () => {
  api.context.mockRejectedValue(new ApiClientError(409, 'INVALID_INCIDENT_STATE', 'An incident must contain at least one verified report.'));
  await expect(loadIncidentOverview('incident-1', 'token')).rejects.toThrow(NO_VERIFIED_INCIDENT_EVIDENCE);
});
