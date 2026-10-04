import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncidentModel } from '../models/incident.model.js';
import { MongooseIncidentRepository } from '../repositories/mongooseIncident.repository.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';
import { incident } from '../../risk-map/tests/riskMap.fixtures.js';

afterEach(() => vi.restoreAllMocks());
describe.each(['memory', 'mongo'] as const)('%s incident map candidates', adapter => {
  async function read(location: unknown) {
    const row = { ...incident(), location };
    if (adapter === 'memory') {
      const repo = new InMemoryIncidentRepository();
      repo.seedIncident(row as ReturnType<typeof incident>);
      repo.seedIncident(incident({ id: '555555555555555555555555', status: 'CLOSED' }));
      return repo.findActiveMapCandidates();
    }
    const query = { select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([{ ...row, _id: row.id }]) };
    const find = vi.spyOn(IncidentModel, 'find').mockReturnValue(query as never);
    const result = await new MongooseIncidentRepository().findActiveMapCandidates();
    expect(find).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(query.select).toHaveBeenCalledWith('_id hazardType location status reportIds');
    return result;
  }
  it.each([
    { type: 'Point', coordinates: [79.86, 6.92] }, { type: 'Point', coordinates: [0, 0] }
  ])('preserves valid coordinates %j and grouped count in narrow projection', async location => {
    expect(await read(location)).toEqual([{ id: '111111111111111111111111', hazardType: 'FLOOD', location, status: 'ACTIVE', reportCount: 4 }]);
  });
  it.each([undefined, null, {}, { type: 'LineString', coordinates: [80, 7] }, { type: 'Point' },
    { type: 'Point', coordinates: [80] }, { type: 'Point', coordinates: [80, 7, 9] },
    { type: 'Point', coordinates: [181, 7] }, { type: 'Point', coordinates: [80, 91] },
    { type: 'Point', coordinates: [NaN, 7] }, { type: 'Point', coordinates: [80, Infinity] },
    { type: 'Point', coordinates: ['80', 7] }
  ])('represents malformed location %j as unavailable without a zero fallback', async location => {
    expect((await read(location))[0]?.location).toBeNull();
  });
});
