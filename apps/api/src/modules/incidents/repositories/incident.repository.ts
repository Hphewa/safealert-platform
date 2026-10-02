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

export type IncidentMapCandidate = {
  id: string;
  hazardType: HazardType;
  location: GeoJsonPoint | null;
  status: 'ACTIVE';
  reportCount: number;
};

export interface IncidentRepository {
  findActiveMapCandidates(): Promise<IncidentMapCandidate[]>;
  create(input: CreateIncidentInput): Promise<SafeIncident>;
  findById(incidentId: string): Promise<SafeIncident | null>;
  findAll(): Promise<SafeIncident[]>;
  findActive(): Promise<SafeIncident[]>;
  findActiveByReportIds(reportIds: string[]): Promise<SafeIncident | null>;
  addReportToActiveIncident(incidentId: string, reportId: string): Promise<SafeIncident | null>;
  findActiveCandidates(query: IncidentCandidateQuery): Promise<ActiveIncidentCandidate[]>;
}

export class ActiveIncidentExistsError extends Error {
  constructor() {
    super('One or more reports already belong to an active incident.');
  }
}
