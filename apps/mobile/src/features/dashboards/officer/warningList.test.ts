import { describe, expect, it } from 'vitest';
import type { MonitoringWarningSummary } from '@safealert/contracts';
import { warningStatusCounts, warningTiming } from './warningList';

const warning = (status: MonitoringWarningSummary['status'], dates: Partial<MonitoringWarningSummary> = {}): MonitoringWarningSummary => ({
  id: 'warning-id', assessmentId: 'assessment-id', status, createdAt: '2026-09-30T08:00:00.000Z', ...dates
});

describe('officer warning list lifecycle presentation', () => {
  it('keeps cancelled and archived warnings out of the published count', () => {
    expect(warningStatusCounts([
      { status: 'NEEDS WARNING' }, { status: 'DRAFT' }, { status: 'PUBLISHED' },
      { status: 'CANCELLED' }, { status: 'ARCHIVED' }, { status: 'CANCELLED' }
    ])).toEqual({ needsWarning: 1, draft: 1, published: 1, cancelled: 2, archived: 1 });
  });

  it('uses the lifecycle timestamp that matches each status', () => {
    const assessedAt = '2026-09-29T08:00:00.000Z';
    expect(warningTiming(null, assessedAt)).toEqual({ label: 'Assessed', time: assessedAt });
    expect(warningTiming(warning('DRAFT'), assessedAt)).toEqual({ label: 'Created', time: '2026-09-30T08:00:00.000Z' });
    expect(warningTiming(warning('PUBLISHED', { publishedAt: '2026-09-30T09:00:00.000Z' }), assessedAt)).toEqual({ label: 'Published', time: '2026-09-30T09:00:00.000Z' });
    expect(warningTiming(warning('CANCELLED', { publishedAt: '2026-09-30T09:00:00.000Z', cancelledAt: '2026-09-30T10:00:00.000Z' }), assessedAt)).toEqual({ label: 'Cancelled', time: '2026-09-30T10:00:00.000Z' });
    expect(warningTiming(warning('ARCHIVED', { archivedAt: '2026-09-30T11:00:00.000Z' }), assessedAt)).toEqual({ label: 'Archived', time: '2026-09-30T11:00:00.000Z' });
    expect(warningTiming(warning('CANCELLED'), assessedAt)).toEqual({ label: 'Cancelled', time: null });
  });
});
