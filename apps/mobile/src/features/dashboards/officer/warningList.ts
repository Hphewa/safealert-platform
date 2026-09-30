import type { MonitoringWarningSummary } from '@safealert/contracts';

export type WarningCardStatus = 'NEEDS WARNING' | 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';

export function warningTiming(warning: MonitoringWarningSummary | null, assessedAt: string): { label: 'Assessed' | 'Created' | 'Published' | 'Cancelled' | 'Archived'; time: string | null } {
  if (!warning) return { label: 'Assessed' as const, time: assessedAt };
  if (warning.status === 'PUBLISHED') return { label: 'Published' as const, time: warning.publishedAt ?? null };
  if (warning.status === 'CANCELLED') return { label: 'Cancelled' as const, time: warning.cancelledAt ?? null };
  if (warning.status === 'ARCHIVED') return { label: 'Archived' as const, time: warning.archivedAt ?? null };
  return { label: 'Created' as const, time: warning.createdAt };
}

export function warningStatusCounts(rows: ReadonlyArray<{ status: WarningCardStatus }>) {
  return rows.reduce((counts, row) => {
    if (row.status === 'NEEDS WARNING') counts.needsWarning += 1;
    else if (row.status === 'DRAFT') counts.draft += 1;
    else if (row.status === 'PUBLISHED') counts.published += 1;
    else if (row.status === 'CANCELLED') counts.cancelled += 1;
    else counts.archived += 1;
    return counts;
  }, { needsWarning: 0, draft: 0, published: 0, cancelled: 0, archived: 0 });
}
