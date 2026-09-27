import { describe, expect, it } from 'vitest';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';
import type { SafeIncident } from '@safealert/contracts';

function incident(id: string, status: SafeIncident['status'], updatedAt: string): SafeIncident {
  return {
    id, status, hazardType: 'FLOOD', reportIds: [], location: { type: 'Point', coordinates: [80, 7] },
    createdAt: updatedAt, updatedAt
  } as SafeIncident;
}

describe('incident lifecycle repository', () => {
  it('returns cloned incidents across statuses in updated-time order while findActive stays active-only', async () => {
    const repository = new InMemoryIncidentRepository();
    repository.seedIncident(incident('active', 'ACTIVE', '2026-09-01T00:00:00.000Z'));
    repository.seedIncident(incident('closed', 'CLOSED', '2026-09-03T00:00:00.000Z'));
    repository.seedIncident(incident('resolved', 'RESOLVED', '2026-09-02T00:00:00.000Z'));

    const all = await repository.findAll();
    expect(all.map(({ id }) => id)).toEqual(['closed', 'resolved', 'active']);
    all[0]!.status = 'ACTIVE';
    expect(await repository.findById('closed')).toMatchObject({ status: 'CLOSED' });
    expect((await repository.findActive()).map(({ id }) => id)).toEqual(['active']);
  });
});
