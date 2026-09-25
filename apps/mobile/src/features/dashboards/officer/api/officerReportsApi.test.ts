import type { SafeReport } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import {
  getPendingOfficerReportById,
  listPendingOfficerReports,
  listVerifiedOfficerReports,
  reviewOfficerReport
} from './officerReportsApi';

const report: SafeReport = {
  id: 'report/one',
  residentId: 'resident-1',
  hazardType: 'FLOOD',
  description: 'Water is crossing the access road.',
  severity: 'HIGH',
  location: {
    type: 'Point',
    coordinates: [79.8612, 6.9271]
  },
  status: 'PENDING',
  createdAt: '2026-08-24T09:00:00.000Z',
  updatedAt: '2026-08-24T09:00:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Officer reports API', () => {
  it('loads pending reports with the authenticated API client', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ reports: [report] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listPendingOfficerReports('officer-access-token');

    expect(response).toEqual({ reports: [report] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/reports/officer/pending`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-access-token' })
      })
    );
  });

  it('loads verified reports for incident grouping', async () => {
    const verifiedReport = { ...report, status: 'VERIFIED' as const };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ reports: [verifiedReport] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listVerifiedOfficerReports('officer-access-token')).resolves.toEqual({ reports: [verifiedReport] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/reports/officer/verified`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-access-token' })
      })
    );
  });

  it('loads an encoded pending report id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report }));
    vi.stubGlobal('fetch', fetchMock);

    await getPendingOfficerReportById('report/one', 'officer-access-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/reports/officer/report%2Fone`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-access-token' })
      })
    );
  });

  it('submits report review actions with authentication', async () => {
    const rejectedReport: SafeReport = {
      ...report,
      status: 'REJECTED',
      rejectionReason: 'The submitted evidence does not match the location.'
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report: rejectedReport }));
    vi.stubGlobal('fetch', fetchMock);

    await reviewOfficerReport(
      'report/one',
      {
        action: 'REJECT',
        rejectionReason: 'The submitted evidence does not match the location.'
      },
      'officer-access-token'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/reports/report%2Fone/verification`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-access-token' }),
        body: JSON.stringify({
          action: 'REJECT',
          rejectionReason: 'The submitted evidence does not match the location.'
        })
      })
    );
  });

  it('submits verification without a rejection reason', async () => {
    const verifiedReport: SafeReport = {
      ...report,
      status: 'VERIFIED'
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report: verifiedReport }));
    vi.stubGlobal('fetch', fetchMock);

    await reviewOfficerReport('report/one', { action: 'VERIFY' }, 'officer-access-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBaseUrl}/reports/report%2Fone/verification`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer officer-access-token' }),
        body: JSON.stringify({ action: 'VERIFY' })
      })
    );
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
