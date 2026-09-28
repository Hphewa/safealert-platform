import { describe, expect, it } from 'vitest';
import type { SafeWarning } from '@safealert/contracts';
import { InMemoryWarningRepository } from '../repositories/inMemoryWarning.repository.js';

function warning(assessmentId: string, status: SafeWarning['status']): SafeWarning {
  return {
    id: `warning-${assessmentId}`, assessmentId, hazardReportId: '123456789012345678901234',
    createdById: '223456789012345678901234', affectedArea: 'Northern district', riskLevel: 'HIGH',
    requiredAction: 'Move to safe ground', unsafeRoads: 'Road A', safeRoutes: 'Road B', message: 'Flood warning',
    attachments: [], status, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z',
    ...(status === 'PUBLISHED' ? { publishedAt: '2026-09-26T13:00:00.000Z' } : {})
  };
}

describe('warning lifecycle repository', () => {
  it('returns all requested warning states and excludes unrelated assessments', async () => {
    const repository = new InMemoryWarningRepository();
    await repository.create(warning('active-id', 'DRAFT'));
    await repository.create(warning('closed-id', 'PUBLISHED'));
    await repository.create(warning('other-id', 'DRAFT'));
    await expect(repository.findByAssessmentIds(['active-id', 'closed-id'])).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ assessmentId: 'active-id', status: 'DRAFT' }),
        expect.objectContaining({ assessmentId: 'closed-id', status: 'PUBLISHED' })])
    );
    expect(await repository.findByAssessmentIds(['active-id', 'closed-id'])).toHaveLength(2);
    await expect(repository.findByAssessmentIds([])).resolves.toEqual([]);
  });
});
