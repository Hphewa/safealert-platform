import type {
  ManualRiskAssessmentClosureReason, RiskAssessmentDeleteReason, SafeRiskAssessment
} from '@safealert/contracts';

// Only the service constructs this input, including server-owned audit fields.
export type CreateRiskAssessmentInput = Omit<
  SafeRiskAssessment,
  'id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'deletedById' | 'deleteReason' | 'deleteNote'
>;
export type ReassessRiskAssessmentRecordInput = Omit<
  CreateRiskAssessmentInput,
  'status' | 'previousAssessmentId' | 'reassessmentReason' | 'closureReason' | 'closedAt' | 'closedById'
> & { reassessmentReason: string };
export type CloseActiveRiskAssessmentInput = {
  closureReason: ManualRiskAssessmentClosureReason;
  closureNote?: string;
  closedAt: string;
  closedById: string;
};
export type SoftDeleteClosedAssessmentInput = {
  deletedAt: string;
  deletedById: string;
  deleteReason: RiskAssessmentDeleteReason;
  deleteNote?: string;
};
export type SoftDeleteClosedAssessmentResult =
  | { kind: 'deleted'; assessment: SafeRiskAssessment }
  | { kind: 'not_found' }
  | { kind: 'not_closed' }
  | { kind: 'already_deleted' };
export interface RiskAssessmentRepository {
  create(input: CreateRiskAssessmentInput): Promise<SafeRiskAssessment>;
  reassess(activeAssessmentId: string, input: ReassessRiskAssessmentRecordInput): Promise<SafeRiskAssessment>;
  closeActiveAssessment(assessmentId: string, input: CloseActiveRiskAssessmentInput): Promise<SafeRiskAssessment | null>;
  softDeleteClosedAssessment(assessmentId: string, input: SoftDeleteClosedAssessmentInput): Promise<SoftDeleteClosedAssessmentResult>;
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
