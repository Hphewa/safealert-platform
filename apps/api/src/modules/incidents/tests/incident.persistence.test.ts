import crypto from 'node:crypto';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncidentModel } from '../models/incident.model.js';

// Opt in with a dedicated test server. A randomly named collection isolates all test writes.
const mongodbUri = process.env.INCIDENT_TEST_MONGODB_URI;
describe.skipIf(!mongodbUri)('incident MongoDB constraints', () => {
  let connection: Connection;
  let model: typeof IncidentModel;
  const collectionName = `incident_foundation_test_${crypto.randomBytes(12).toString('hex')}`;

  beforeAll(async () => {
    connection = await mongoose.createConnection(mongodbUri!, { serverSelectionTimeoutMS: 5000 }).asPromise();
    model = connection.model('Incident', IncidentModel.schema, collectionName);
    await model.init();
  });

  afterAll(async () => {
    try {
      // Drop only this suite's generated collection, never the database or application collections.
      if (model && connection.readyState === 1) await model.collection.drop();
    } finally {
      await connection?.close();
    }
  });

  function input(reportIds: mongoose.Types.ObjectId[]) {
    return {
      hazardType: 'FLOOD' as const, location: { type: 'Point' as const, coordinates: [79.8612, 6.9271] },
      reportIds, createdById: new mongoose.Types.ObjectId(), status: 'ACTIVE' as const
    };
  }

  it('arbitrates racing overlapping arrays without partially reserving the losing array', async () => {
    const first = new mongoose.Types.ObjectId();
    const shared = new mongoose.Types.ObjectId();
    const last = new mongoose.Types.ObjectId();
    const results = await Promise.allSettled([
      model.create(input([first, shared])), model.create(input([shared, last]))
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({ code: 11000 });
    expect(await model.countDocuments({ status: 'ACTIVE', reportIds: shared })).toBe(1);
    const losingUniqueId = results[0]!.status === 'rejected' ? first : last;
    await expect(model.create(input([losingUniqueId]))).resolves.toBeDefined();
  });

  it('allows historical membership while enforcing only one ACTIVE incident', async () => {
    const reportId = new mongoose.Types.ObjectId();
    const values = input([reportId]);
    await model.create({ ...values, status: 'RESOLVED' });
    await model.create({ ...values, status: 'CLOSED' });
    await model.create(values);
    await expect(model.create(values)).rejects.toMatchObject({ code: 11000 });
    expect(await model.countDocuments({ reportIds: reportId })).toBe(3);
  });

  it('supports GeoJSON proximity queries through its 2dsphere index', async () => {
    const incident = await model.create(input([new mongoose.Types.ObjectId()]));
    const nearby = await model.find({
      _id: incident._id,
      location: { $near: { $geometry: { type: 'Point', coordinates: [79.8612, 6.9271] }, $maxDistance: 10 } }
    });
    expect(nearby.map((item) => item._id.toString())).toEqual([incident._id.toString()]);
  });
});
