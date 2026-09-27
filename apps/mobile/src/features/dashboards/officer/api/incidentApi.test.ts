import type {
  IncidentCandidatesResponse,
  IncidentMonitoringDetailResponse,
  IncidentMonitoringListResponse,
  InitialAssessmentQueueResponse,
  IncidentWithReportsResponse,
  SafeReport
} from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import {
  attachReportToIncident,
  createIncidentFromReport,
  getIncidentCandidates,
  getIncidentDetails,
  getIncidentMonitoringDetail,
  listIncidentMonitoring,
  listActiveIncidents,
  listInitialAssessmentQueue
} from './incidentApi';

const reportId = 'report/one';
const incidentId = 'incident/one';

afterEach(() => vi.unstubAllGlobals());

describe('Officer incident API', () => {
  it('loads the initial-assessment queue through one authenticated request', async () => {
    const body: InitialAssessmentQueueResponse = { incidents: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listInitialAssessmentQueue('officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/incidents/assessment-queue`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
    }));
  });

  it('loads monitoring summaries through one authenticated request', async () => {
    const body: IncidentMonitoringListResponse = { incidents: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listIncidentMonitoring('officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/incidents/monitoring`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
    }));
  });

  it('loads monitoring detail with an encoded incident ID and auth token', async () => {
    const body: IncidentMonitoringDetailResponse = { monitoring: {} as IncidentMonitoringDetailResponse['monitoring'], recentVerifiedReports: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getIncidentMonitoringDetail(incidentId, 'officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(`${apiBaseUrl}/incidents/monitoring/incident%2Fone`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
    }));
  });
  it('loads active incidents for the assessment selection screen', async () => {
    const body = { incidents: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listActiveIncidents('officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/incidents/active`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
      })
    );
  });

  it('loads candidates with the authenticated API client and encodes the report id', async () => {
    const body: IncidentCandidatesResponse = { candidates: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getIncidentCandidates(reportId, 'officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/incidents/candidates?reportId=report%2Fone`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
      })
    );
  });

  it('creates an incident only from the selected report reference', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ incident: { id: incidentId } }));
    vi.stubGlobal('fetch', fetchMock);

    await createIncidentFromReport(reportId, 'officer-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/incidents`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reportIds: [reportId] }),
        headers: expect.objectContaining({ Authorization: 'Bearer officer-token' })
      })
    );
  });

  it('attaches a report to an encoded incident path', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ incident: { id: incidentId } }));
    vi.stubGlobal('fetch', fetchMock);

    await attachReportToIncident(incidentId, reportId, 'officer-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/incidents/incident%2Fone/reports`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reportId }) })
    );
  });

  it('loads related source reports without changing their evidence shape', async () => {
    const report: SafeReport = {
      id: reportId,
      residentId: 'resident-1',
      hazardType: 'FLOOD',
      description: 'Water is crossing the road.',
      severity: 'HIGH',
      location: { type: 'Point', coordinates: [79.8612, 6.9271] },
      status: 'VERIFIED',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:05:00.000Z'
    };
    const body: IncidentWithReportsResponse = {
      incident: {
        id: incidentId,
        hazardType: 'FLOOD',
        location: report.location,
        reportIds: [report.id],
        status: 'ACTIVE',
        createdById: 'officer-1',
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      },
      reports: [report]
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getIncidentDetails(incidentId, 'officer-token')).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/incidents/incident%2Fone/reports`,
      expect.objectContaining({ method: 'GET' })
    );
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
