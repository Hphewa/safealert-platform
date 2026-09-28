import crypto from 'node:crypto';
import type { SafeIncident } from '@safealert/contracts';
import {
  ActiveIncidentExistsError, type CreateIncidentInput, type IncidentRepository
} from './incident.repository.js';
import { haversineDistanceMeters } from '../../../shared/geo.js';

export class InMemoryIncidentRepository implements IncidentRepository {
  private readonly incidents = new Map<string, SafeIncident>();

  /** Test-only fixture hook; production code should use create through IncidentService. */
  seedIncident(incident: SafeIncident) { this.incidents.set(incident.id, structuredClone(incident)); }

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

  async findAll() {
    return [...this.incidents.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
      .map((incident) => structuredClone(incident));
  }

  async findActive() {
    return [...this.incidents.values()]
      .filter((incident) => incident.status === 'ACTIVE')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((incident) => structuredClone(incident));
  }

  async findActiveByReportIds(reportIds: string[]) {
    return structuredClone(this.findActiveOverlap(reportIds));
  }

  async addReportToActiveIncident(incidentId: string, reportId: string) {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.status !== 'ACTIVE') return null;
    if (incident.reportIds.includes(reportId)) return structuredClone(incident);
    if (this.findActiveOverlap([reportId])) throw new ActiveIncidentExistsError();
    incident.reportIds.push(reportId);
    incident.updatedAt = new Date().toISOString();
    return structuredClone(incident);
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
