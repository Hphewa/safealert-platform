import crypto from 'node:crypto';
import type { SafeIncident } from '@safealert/contracts';
import {
  ActiveIncidentExistsError, type CreateIncidentInput, type IncidentRepository
} from './incident.repository.js';
import { haversineDistanceMeters } from '../../../shared/geo.js';

export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly incidents = new Map<string, SafeIncident>();

  async create(input: CreateIncidentInput): Promise<SafeIncident> {
    // Keep the membership check and insert synchronous to emulate one atomic database insert.
    if (input.status === 'ACTIVE' && this.findActiveOverlap(input.reportIds)) {
      throw new ActiveIncidentExistsError();
    }
    const now = new Date().toISOString();
    const incident: SafeIncident = {
      ...input, id: crypto.randomBytes(12).toString('hex'), createdAt: now, updatedAt: now
    };
    this.incidents.set(incident.id, structuredClone(incident));
    return structuredClone(incident);
  }

  async findById(incidentId: string) {
    return structuredClone(this.incidents.get(incidentId) ?? null);
  }

  async findActiveByReportIds(reportIds: string[]) {
    return structuredClone(this.findActiveOverlap(reportIds));
  }

  async findActiveCandidates(query: Parameters<IncidentRepository['findActiveCandidates']>[0]) {
    return [...this.incidents.values()]
      .filter((incident) => incident.status === 'ACTIVE' && incident.hazardType === query.hazardType)
      .map((incident) => ({
        incident,
        distanceMeters: haversineDistanceMeters(query.location, incident.location)
      }))
      .filter((candidate) => candidate.distanceMeters <= query.radiusMeters)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .map((candidate) => ({ ...candidate, incident: structuredClone(candidate.incident) }));
  }

  private findActiveOverlap(reportIds: string[]) {
    const selectedIds = new Set(reportIds);
    return [...this.incidents.values()].find((incident) =>
      incident.status === 'ACTIVE' && incident.reportIds.some((id) => selectedIds.has(id))
    ) ?? null;
  }
}
