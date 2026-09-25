import type { GeoJsonPoint, HazardType, SafeIncident } from '@safealert/contracts';

// Constructed by the service after checking all referenced reports, never from request.body.
export type CreateIncidentInput = Omit<SafeIncident, 'id' | 'createdAt' | 'updatedAt'>;
export type IncidentCandidateQuery = {
  hazardType: HazardType;
  location: GeoJsonPoint;
  radiusMeters: number;
};
export type ActiveIncidentCandidate = {
  incident: SafeIncident;
  distanceMeters: number;
};

export interface IncidentRepository {
  create(input: CreateIncidentInput): Promise<SafeIncident>;
  findById(incidentId: string): Promise<SafeIncident | null>;
  findActiveByReportIds(reportIds: string[]): Promise<SafeIncident | null>;
  findActiveCandidates(query: IncidentCandidateQuery): Promise<ActiveIncidentCandidate[]>;
}

export class ActiveIncidentExistsError extends Error {
  constructor() {
    super('One or more reports already belong to an active incident.');
  }
}
