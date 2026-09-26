import type { SafeRiskAssessment } from '@safealert/contracts';

// Only the service constructs this input, including server-owned audit fields.
export type CreateRiskAssessmentInput = Omit<SafeRiskAssessment, 'id' | 'createdAt' | 'updatedAt'>;
export type ReassessRiskAssessmentRecordInput = Omit<
  CreateRiskAssessmentInput,
  'status' | 'previousAssessmentId' | 'reassessmentReason' | 'closureReason' | 'closedAt' | 'closedById'
> & { reassessmentReason: string };
export interface RiskAssessmentRepository {
  create(input: CreateRiskAssessmentInput): Promise<SafeRiskAssessment>;
  reassess(activeAssessmentId: string, input: ReassessRiskAssessmentRecordInput): Promise<SafeRiskAssessment>;
  findById(assessmentId: string): Promise<SafeRiskAssessment | null>;
  findActiveByIncidentId(incidentId: string): Promise<SafeRiskAssessment | null>;
  findHistoryByIncidentId(incidentId: string): Promise<SafeRiskAssessment[]>;
}
export class ActiveRiskAssessmentExistsError extends Error {
  constructor() {
    super('An active risk assessment already exists for this incident.');
  }
}
export class RiskAssessmentReassessmentConflictError extends Error {
  constructor() {
    super('The active risk assessment has already changed. Refresh the incident before reassessing.');
  }
}
