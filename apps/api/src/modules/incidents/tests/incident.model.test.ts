import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncidentModel, toSafeIncident } from '../models/incident.model.js';
import { InMemoryIncidentRepository } from '../repositories/inMemoryIncident.repository.js';
import { MongooseIncidentRepository } from '../repositories/mongooseIncident.repository.js';
import { ActiveIncidentExistsError, type CreateIncidentInput } from '../repositories/incident.repository.js';

function input(): CreateIncidentInput {
  return {
    hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.8612, 6.9271] },
    reportIds: [new mongoose.Types.ObjectId().toHexString()],
    createdById: new mongoose.Types.ObjectId().toHexString(), status: 'ACTIVE'
  };
}

afterEach(() => vi.restoreAllMocks());

describe('incident persistence', () => {
  it('declares report/user references and separate geospatial and active-membership indexes', () => {
    expect(IncidentModel.schema.indexes()).toContainEqual([
      { reportIds: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { status: 'ACTIVE' } })
    ]);
    expect(IncidentModel.schema.indexes()).toContainEqual([{ location: '2dsphere' }, expect.any(Object)]);
    expect(IncidentModel.schema.path('createdById').options.ref).toBe('User');
    const reportIds = IncidentModel.schema.path('reportIds') as mongoose.Schema.Types.Array;
    expect(reportIds.getEmbeddedSchemaType()?.options.ref).toBe('Report');
  });

  it('serializes ObjectIds, coordinates and dates without MongoDB internals or duplicated evidence', async () => {
    const values = input();
    const now = new Date('2026-09-25T10:00:00Z');
    const document = new IncidentModel({ ...values, createdAt: now, updatedAt: now });
    await expect(document.validate()).resolves.toBeUndefined();
    expect(toSafeIncident(document)).toEqual({
      ...values, id: document._id.toString(), createdAt: now.toISOString(), updatedAt: now.toISOString()
    });
  });

  it.each([
    { reportIds: [] }, { reportIds: undefined }, { reportIds: null },
    { reportIds: ['abcdef123456789012345601', 'ABCDEF123456789012345601'] },
    { hazardType: 'INVALID' }, { status: 'INVALID' }, { createdById: undefined },
    { location: { type: 'Point', coordinates: [181, 0] } },
    { location: { type: 'Point', coordinates: [0, -91] } },
    { location: { type: 'Point', coordinates: [0] } },
    { location: { type: 'Point', coordinates: [0, 0, 0] } },
    { location: { type: 'Point', coordinates: [Infinity, 0] } },
    { location: { type: 'LineString', coordinates: [0, 0] } }
  ])('rejects invalid stored data: %j', async (invalid) => {
    await expect(new IncidentModel({ ...input(), ...invalid }).validate()).rejects.toThrow();
  });

  it('rejects excessive report references at the model boundary', async () => {
    const reportIds = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId());
    await expect(new IncidentModel({ ...input(), reportIds }).validate()).rejects.toThrow();
  });

  it.each(['RESOLVED', 'CLOSED'] as const)('allows historical %s incidents without reserving active membership in memory', async (status) => {
    const repository = new InMemoryIncidentRepository();
    const values = input();
    await repository.create({ ...values, status });
    expect(await repository.findActiveByReportIds(values.reportIds)).toBeNull();
    const active = await repository.create(values);
    expect(await repository.findActiveByReportIds(values.reportIds)).toEqual(active);
    await expect(repository.create(values)).rejects.toBeInstanceOf(ActiveIncidentExistsError);
  });

  it('does not expose mutable references from the in-memory repository', async () => {
    const repository = new InMemoryIncidentRepository();
    const values = input();
    const incident = await repository.create(values);
    values.reportIds.length = 0;
    incident.location.coordinates[0] = 0;
    const stored = await repository.findById(incident.id);
    expect(stored?.reportIds).toHaveLength(1);
    expect(stored?.location.coordinates).toEqual([79.8612, 6.9271]);
    stored!.reportIds.length = 0;
    expect((await repository.findById(incident.id))?.reportIds).toHaveLength(1);
  });

  it('awaits index initialization and translates MongoDB duplicate membership errors', async () => {
    const init = vi.spyOn(IncidentModel, 'init').mockResolvedValue(new IncidentModel(input()));
    const create = vi.spyOn(IncidentModel, 'create').mockRejectedValue({ code: 11000 });
    await expect(new MongooseIncidentRepository().create(input())).rejects.toBeInstanceOf(ActiveIncidentExistsError);
    expect(init.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]!);
  });

  it('does not turn unrelated database failures into membership conflicts', async () => {
    vi.spyOn(IncidentModel, 'init').mockResolvedValue(new IncidentModel(input()));
    const failure = new Error('Database unavailable');
    vi.spyOn(IncidentModel, 'create').mockRejectedValue(failure);
    await expect(new MongooseIncidentRepository().create(input())).rejects.toBe(failure);
  });

  it('does not write when index initialization fails', async () => {
    vi.spyOn(IncidentModel, 'init').mockRejectedValue(new Error('Index unavailable'));
    const create = vi.spyOn(IncidentModel, 'create');
    await expect(new MongooseIncidentRepository().create(input())).rejects.toThrow('Index unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
