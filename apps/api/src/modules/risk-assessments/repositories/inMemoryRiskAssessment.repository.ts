import crypto from 'node:crypto';
import type { SafeRiskAssessment } from '@safealert/contracts';
import {
  ActiveRiskAssessmentExistsError, RiskAssessmentReassessmentConflictError,
  type CloseActiveRiskAssessmentInput, type CreateRiskAssessmentInput,
  type ReassessRiskAssessmentRecordInput, type RiskAssessmentRepository
} from './riskAssessment.repository.js';

export class InMemoryRiskAssessmentRepository implements RiskAssessmentRepository {
  private readonly assessments = new Map<string, SafeRiskAssessment>();
  async create(input: CreateRiskAssessmentInput): Promise<SafeRiskAssessment> {
    // No await between uniqueness check and insertion: emulate the atomic DB insert.
    if (input.status === 'ACTIVE' && [...this.assessments.values()].some(
      (assessment) => assessment.incidentId === input.incidentId && assessment.status === 'ACTIVE'
    )) throw new ActiveRiskAssessmentExistsError();
    const now = new Date().toISOString();
    const assessment: SafeRiskAssessment = {
      ...input, id: crypto.randomBytes(12).toString('hex'), createdAt: now, updatedAt: now
    };
    this.assessments.set(assessment.id, structuredClone(assessment));
    return structuredClone(assessment);
  }
  async reassess(activeAssessmentId: string, input: ReassessRiskAssessmentRecordInput): Promise<SafeRiskAssessment> {
    const previous = this.assessments.get(activeAssessmentId);
    if (!previous || previous.status !== 'ACTIVE' || previous.incidentId !== input.incidentId) {
      throw new RiskAssessmentReassessmentConflictError();
    }
    if ([...this.assessments.values()].some(
      (assessment) => assessment.id !== activeAssessmentId &&
        assessment.incidentId === input.incidentId && assessment.status === 'ACTIVE'
    )) throw new RiskAssessmentReassessmentConflictError();

    const now = new Date().toISOString();
    const reassessed: SafeRiskAssessment = {
      ...input, id: crypto.randomBytes(12).toString('hex'), status: 'ACTIVE',
      previousAssessmentId: activeAssessmentId, createdAt: now, updatedAt: now
    };
    const closed: SafeRiskAssessment = {
      ...previous, status: 'CLOSED', closureReason: 'REASSESSED',
      closedAt: now, closedById: input.assessedById, updatedAt: now
    };
    const closedRecord = structuredClone(closed);
    const reassessedRecord = structuredClone(reassessed);
    const result = structuredClone(reassessed);

    // Both map writes are synchronous, so observers cannot see a half-transition.
    this.assessments.set(activeAssessmentId, closedRecord);
    this.assessments.set(reassessed.id, reassessedRecord);
    return result;
  }
  async closeActiveAssessment(assessmentId: string, input: CloseActiveRiskAssessmentInput): Promise<SafeRiskAssessment | null> {
    const active = this.assessments.get(assessmentId);
    if (!active || active.status !== 'ACTIVE') return null;
    // No await between checking ACTIVE and replacing the record.
    const closed: SafeRiskAssessment = {
      ...active, status: 'CLOSED', closureReason: input.closureReason,
      ...(input.closureNote === undefined ? {} : { closureNote: input.closureNote }),
      closedAt: input.closedAt, closedById: input.closedById,
      updatedAt: new Date().toISOString()
    };
    this.assessments.set(assessmentId, structuredClone(closed));
    return structuredClone(closed);
  }
  async findById(assessmentId: string) {
    return structuredClone(this.assessments.get(assessmentId) ?? null);
  }
  async findActiveByIncidentId(incidentId: string) {
    return structuredClone([...this.assessments.values()].find(
      (assessment) => assessment.incidentId === incidentId && assessment.status === 'ACTIVE'
    ) ?? null);
  }
  async findHistoryByIncidentId(incidentId: string) {
    return [...this.assessments.values()]
      .filter((assessment) => assessment.incidentId === incidentId)
      .sort((left, right) => right.assessedAt.localeCompare(left.assessedAt) || right.id.localeCompare(left.id))
      .map((assessment) => structuredClone(assessment));
  }
}
