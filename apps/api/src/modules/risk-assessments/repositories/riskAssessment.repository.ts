import type { SafeRiskAssessment } from '@safealert/contracts';

// Only the service constructs this input, including server-owned audit fields.
export type CreateRiskAssessmentInput = Omit<SafeRiskAssessment, 'id' | 'createdAt' | 'updatedAt'>;
export interface RiskAssessmentRepository {
  create(input: CreateRiskAssessmentInput): Promise<SafeRiskAssessment>;
  findById(assessmentId: string): Promise<SafeRiskAssessment | null>;
  findActiveByIncidentId(incidentId: string): Promise<SafeRiskAssessment | null>;
}
export class ActiveRiskAssessmentExistsError extends Error {
  constructor() {
    super('An active risk assessment already exists for this incident.');
  }
}
