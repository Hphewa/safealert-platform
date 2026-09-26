import type { SafeReport } from '@safealert/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl } from '../../../../services/api/client';
import { cancelMyPendingReport, getMyReportById, listMyReportFieldConfirmations, listMyReports, updateMyPendingReport } from './reportApi';

const report: SafeReport = {
  id: 'report/one',
  residentId: 'resident-1',
  hazardType: 'FLOOD',
  description: 'Water is rising near the lower bridge.',
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

describe('resident report API', () => {
  it('loads authenticated resident submitted reports through the shared API client', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ reports: [report] }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listMyReports('resident-access-token');

    expect(response).toEqual({ reports: [report] });
    expect(fetchMock).toHaveBeenCalledWith(
      apiBaseUrl + '/reports/mine',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer resident-access-token' })
      })
    );
  });

  it('loads an encoded resident-owned report id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await getMyReportById('report/one', 'resident-access-token');

    expect(response).toEqual({ report });
    expect(fetchMock).toHaveBeenCalledWith(
      apiBaseUrl + '/reports/mine/report%2Fone',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer resident-access-token' })
      })
    );
  });

  it('loads field confirmations for an encoded resident-owned report id', async () => {
    const confirmations = [{ id: 'confirmation-1', reportId: 'report/one', outcome: 'UNABLE_TO_CONFIRM', reason: 'Other', reasonDetails: 'Water receded.', status: 'PENDING', createdAt: report.createdAt, updatedAt: report.updatedAt }];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ confirmations }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await listMyReportFieldConfirmations('report/one', 'resident-access-token');

    expect(response).toEqual({ confirmations });
    expect(fetchMock).toHaveBeenCalledWith(
      apiBaseUrl + '/reports/mine/report%2Fone/field-confirmations',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer resident-access-token' })
      })
    );
  });

  it('updates an encoded pending resident-owned report id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await updateMyPendingReport(
      'report/one',
      { description: 'Updated before verification.' },
      'resident-access-token'
    );

    expect(response).toEqual({ report });
    expect(fetchMock).toHaveBeenCalledWith(
      apiBaseUrl + '/reports/mine/report%2Fone',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer resident-access-token' }),
        body: JSON.stringify({ description: 'Updated before verification.' })
      })
    );
  });

  it('cancels an encoded pending resident-owned report id', async () => {
    const cancelledReport: SafeReport = {
      ...report,
      status: 'CANCELLED',
      cancelledById: 'resident-1',
      cancelledAt: '2026-08-24T09:30:00.000Z'
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ report: cancelledReport }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await cancelMyPendingReport('report/one', 'resident-access-token');

    expect(response).toEqual({ report: cancelledReport });
    expect(fetchMock).toHaveBeenCalledWith(
      apiBaseUrl + '/reports/mine/report%2Fone/cancel',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer resident-access-token' })
      })
    );
  });

  it('preserves API client errors for missing or foreign resident reports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'REPORT_NOT_FOUND',
              message: 'Report not found.'
            }
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      )
    );

    await expect(getMyReportById('foreign-report', 'resident-access-token')).rejects.toMatchObject({
      status: 404,
      code: 'REPORT_NOT_FOUND',
      message: 'Report not found.'
    });
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
