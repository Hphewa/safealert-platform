import crypto from 'node:crypto';
import type { SafeRiskAssessment } from '@safealert/contracts';
import {
  ActiveRiskAssessmentExistsError, RiskAssessmentReassessmentConflictError,
  type CloseActiveRiskAssessmentInput, type CreateRiskAssessmentInput,
  type ReassessRiskAssessmentRecordInput, type RiskAssessmentRepository,
  type SoftDeleteClosedAssessmentInput, type SoftDeleteClosedAssessmentResult,
  type AssessmentLifecycleForIncident
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
      ...input, isDeleted: false, id: crypto.randomBytes(12).toString('hex'), createdAt: now, updatedAt: now
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
      previousAssessmentId: activeAssessmentId, isDeleted: false, createdAt: now, updatedAt: now
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
  async softDeleteClosedAssessment(
    assessmentId: string, input: SoftDeleteClosedAssessmentInput
  ): Promise<SoftDeleteClosedAssessmentResult> {
    const assessment = this.assessments.get(assessmentId);
    if (!assessment) return { kind: 'not_found' };
    if (assessment.isDeleted) return { kind: 'already_deleted' };
    if (assessment.status !== 'CLOSED') return { kind: 'not_closed' };

    // No await between the eligibility check and update, so concurrent calls have one winner.
    const deleted: SafeRiskAssessment = {
      ...assessment, isDeleted: true, deletedAt: input.deletedAt, deletedById: input.deletedById,
      deleteReason: input.deleteReason,
      ...(input.deleteNote === undefined ? {} : { deleteNote: input.deleteNote }),
      updatedAt: new Date().toISOString()
    };
    this.assessments.set(assessmentId, structuredClone(deleted));
    return { kind: 'deleted', assessment: structuredClone(deleted) };
  }
  async findById(assessmentId: string) {
    const assessment = this.assessments.get(assessmentId);
    return structuredClone(assessment && !assessment.isDeleted ? assessment : null);
  }
  async findActiveByIncidentId(incidentId: string) {
    return structuredClone([...this.assessments.values()].find(
      (assessment) => assessment.incidentId === incidentId && assessment.status === 'ACTIVE' && !assessment.isDeleted
    ) ?? null);
  }
  async findHistoryByIncidentId(incidentId: string) {
    return [...this.assessments.values()]
      .filter((assessment) => assessment.incidentId === incidentId)
      .filter((assessment) => !assessment.isDeleted)
      .sort((left, right) => right.assessedAt.localeCompare(left.assessedAt) || right.id.localeCompare(left.id))
      .map((assessment) => structuredClone(assessment));
  }

  async findLifecycleByIncidentIds(incidentIds: string[]): Promise<AssessmentLifecycleForIncident[]> {
    const requested = new Set(incidentIds);
    const grouped = new Map<string, SafeRiskAssessment[]>();
    for (const assessment of this.assessments.values()) {
      if (!requested.has(assessment.incidentId)) continue;
      const records = grouped.get(assessment.incidentId) ?? [];
      records.push(assessment);
      grouped.set(assessment.incidentId, records);
    }

    return incidentIds.map((incidentId) => {
      const records = grouped.get(incidentId) ?? [];
      const visible = records.filter((assessment) => !assessment.isDeleted)
        .sort((left, right) => right.assessedAt.localeCompare(left.assessedAt) || right.id.localeCompare(left.id));
      const summary = (assessment: SafeRiskAssessment) => ({
        id: assessment.id, finalRiskLevel: assessment.finalRiskLevel,
        calculatedScore: assessment.calculatedScore, status: assessment.status,
        assessedAt: assessment.assessedAt,
        ...(assessment.closureReason === undefined ? {} : { closureReason: assessment.closureReason }),
        ...(assessment.closedAt === undefined ? {} : { closedAt: assessment.closedAt })
      });
      const active = visible.find((assessment) => assessment.status === 'ACTIVE');
      return {
        incidentId, hasEverBeenAssessed: records.length > 0,
        currentAssessment: active ? summary(active) : null,
        latestAssessment: visible[0] ? summary(visible[0]) : null
      };
    });
  }
}
