import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportModel } from '../models/report.model.js';
import { MongooseReportRepository } from '../repositories/mongooseReport.repository.js';
import { InMemoryReportRepository } from '../repositories/inMemoryReport.repository.js';
import type { SafeReport } from '@safealert/contracts';

afterEach(() => vi.restoreAllMocks());
const image = '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.jpg';
const report = (overrides: Partial<SafeReport> = {}): SafeReport => ({
  id: '111111111111111111111111', residentId: '222222222222222222222222', hazardType: 'FLOOD',
  description: 'Private report description', severity: 'LOW', location: { type: 'Point', coordinates: [79, 6] },
  status: 'VERIFIED', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
  mediaReference: image, verifiedById: '333333333333333333333333', ...overrides
});

describe.each(['memory', 'mongo'] as const)('%s report image evidence projection', adapter => {
  it('selects verified report image references without returning report details', async () => {
    const row = report();
    let read: () => Promise<unknown>;
    if (adapter === 'memory') {
      const repository = new InMemoryReportRepository();
      repository.seedReport(row);
      repository.seedReport(report({ id: '444444444444444444444444', status: 'PENDING' }));
      repository.seedReport(report({ id: '555555555555555555555555', mediaReference: '/api/v1/media/report-evidence/2026-10-01-123e4567-e89b-12d3-a456-426614174000.mp4' }));
      repository.seedReport(report({ id: '666666666666666666666666', mediaReference: 'file:///secret/image.png' }));
      read = () => repository.findVerifiedImageEvidenceByIds([row.id, '444444444444444444444444', '555555555555555555555555', '666666666666666666666666']);
    } else {
      const query = { select: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([
        { _id: { toString: () => row.id }, mediaReference: image, createdAt: new Date(row.createdAt), description: row.description, residentId: row.residentId },
        { _id: { toString: () => '444444444444444444444444' }, mediaReference: 'file:///secret/image.png', createdAt: new Date(row.createdAt) }
      ]) };
      const find = vi.spyOn(ReportModel, 'find').mockReturnValue(query as never);
      read = async () => {
        const result = await new MongooseReportRepository().findVerifiedImageEvidenceByIds([row.id, '444444444444444444444444']);
        expect(find).toHaveBeenCalledWith({ _id: { $in: [row.id, '444444444444444444444444'] }, status: 'VERIFIED' });
        expect(query.select).toHaveBeenCalledWith('_id mediaReference createdAt');
        return result;
      };
    }
    await expect(read()).resolves.toEqual([{ id: row.id, imageReference: image, createdAt: row.createdAt }]);
  });
  it('does not query when the incident has no report IDs', async () => {
    if (adapter === 'memory') {
      await expect(new InMemoryReportRepository().findVerifiedImageEvidenceByIds([])).resolves.toEqual([]);
    } else {
      const find = vi.spyOn(ReportModel, 'find');
      await expect(new MongooseReportRepository().findVerifiedImageEvidenceByIds([])).resolves.toEqual([]);
      expect(find).not.toHaveBeenCalled();
    }
  });
});
