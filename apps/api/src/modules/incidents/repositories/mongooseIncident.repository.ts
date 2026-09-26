import { IncidentModel, toSafeIncident } from '../models/incident.model.js';
import {
  ActiveIncidentExistsError, type CreateIncidentInput, type IncidentRepository
} from './incident.repository.js';

export class MongooseIncidentRepository implements IncidentRepository {
  async create(input: CreateIncidentInput) {
    // Index initialization must succeed before the first write can rely on uniqueness.
    await IncidentModel.init();
    try {
      return toSafeIncident(await IncidentModel.create(input));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ActiveIncidentExistsError();
      }
      throw error;
    }
  }

  async findById(incidentId: string) {
    const incident = await IncidentModel.findById(incidentId).exec();
    return incident ? toSafeIncident(incident) : null;
  }

  async findActive() {
    const incidents = await IncidentModel.find({ status: 'ACTIVE' }).sort({ updatedAt: -1 }).exec();
    return incidents.map(toSafeIncident);
  }

  async findActiveByReportIds(reportIds: string[]) {
    const incident = await IncidentModel.findOne({ status: 'ACTIVE', reportIds: { $in: reportIds } }).exec();
    return incident ? toSafeIncident(incident) : null;
  }

  async addReportToActiveIncident(incidentId: string, reportId: string) {
    try {
      const incident = await IncidentModel.findOneAndUpdate(
        { _id: incidentId, status: 'ACTIVE' },
        { $addToSet: { reportIds: reportId }, $set: { updatedAt: new Date() } },
        { new: true, runValidators: true }
      ).exec();
      return incident ? toSafeIncident(incident) : null;
    } catch (error) {
      // The partial unique multikey index arbitrates concurrent attachment to another active incident.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new ActiveIncidentExistsError();
      }
      throw error;
    }
  }

  async findActiveCandidates(query: Parameters<IncidentRepository['findActiveCandidates']>[0]) {
    const incidents = await IncidentModel.aggregate<{ distanceMeters: number }>([
      {
        $geoNear: {
          near: query.location,
          distanceField: 'distanceMeters',
          maxDistance: query.radiusMeters,
          spherical: true,
          query: { status: 'ACTIVE', hazardType: query.hazardType }
        }
      }
    ]).exec();

    return incidents
      .map((raw) => ({
        incident: toSafeIncident(IncidentModel.hydrate(raw)),
        distanceMeters: raw.distanceMeters
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
  }
}
