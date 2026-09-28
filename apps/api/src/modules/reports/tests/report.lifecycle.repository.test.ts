import { describe, expect, it } from 'vitest';
import type { SafeReport } from '@safealert/contracts';
import { InMemoryReportRepository } from '../repositories/inMemoryReport.repository.js';

function report(id: string, status: SafeReport['status']): SafeReport {
  return {
    id, residentId: '123456789012345678901234', hazardType: 'FLOOD', description: `${id} report`,
    severity: 'HIGH', location: { type: 'Point', coordinates: [80, 7] }, status,
    createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z',
    ...(status === 'VERIFIED' ? { verifiedAt: '2026-09-26T13:00:00.000Z' } : {})
  };
}

describe('report lifecycle repository', () => {
  it('returns only requested verified summary fields and handles empty IDs', async () => {
    const repository = new InMemoryReportRepository();
    repository.seedReport(report('verified-id', 'VERIFIED'));
    repository.seedReport(report('pending-id', 'PENDING'));
    repository.seedReport(report('rejected-id', 'REJECTED'));
    repository.seedReport(report('cancelled-id', 'CANCELLED'));
    const summaries = await repository.findVerifiedSummariesByIds(['verified-id', 'pending-id', 'missing-id']);
    expect(summaries).toEqual([{
      id: 'verified-id', description: 'verified-id report', severity: 'HIGH', verifiedAt: '2026-09-26T13:00:00.000Z'
    }]);
    await expect(repository.findVerifiedSummariesByIds([])).resolves.toEqual([]);
  });
});
