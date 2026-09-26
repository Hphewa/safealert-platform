import crypto from 'node:crypto';
import type { SafeRiskAssessment } from '@safealert/contracts';
import {
  ActiveRiskAssessmentExistsError, type CreateRiskAssessmentInput, type RiskAssessmentRepository
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
  async findById(assessmentId: string) {
    return structuredClone(this.assessments.get(assessmentId) ?? null);
  }
  async findActiveByIncidentId(incidentId: string) {
    return structuredClone([...this.assessments.values()].find(
      (assessment) => assessment.incidentId === incidentId && assessment.status === 'ACTIVE'
    ) ?? null);
  }
}
