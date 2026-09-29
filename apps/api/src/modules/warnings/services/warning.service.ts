import {
  canCreateWarning, WARNING_DISTRICTS,
  type ArchiveWarningResponse, type CancelWarningResponse,
  type CreateWarningRequest, type CreateWarningResponse, type PublishWarningRequest,
  type PublishWarningResponse, type SafeWarning,
  type UpdateWarningRequest, type UpdateWarningResponse
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { IncidentRepository } from '../../incidents/repositories/incident.repository.js';
import type { WarningRepository, UpdateWarningInput as WarningChanges } from '../repositories/warning.repository.js';
import type { WarningAttachmentRepository } from '../repositories/warningAttachment.repository.js';

export type WarningPublishedHandler = (warning: SafeWarning) => Promise<void> | void;

export class WarningService {
  constructor(private readonly warnings: WarningRepository, private readonly assessments: RiskAssessmentRepository,
    private readonly images: WarningAttachmentRepository, private readonly incidents?: IncidentRepository,
    private readonly onPublished?: WarningPublishedHandler) {}

  async create(officerId: string, input: CreateWarningRequest): Promise<CreateWarningResponse> {
    const assessment = await this.assessments.findById(input.assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    if (assessment.status !== 'ACTIVE') {
      throw new ApiError(409, 'ASSESSMENT_NOT_ACTIVE', 'Only an active risk assessment can be used to create a warning.');
    }
    if (!canCreateWarning(assessment.finalRiskLevel)) {
      throw new ApiError(409, 'WARNING_RISK_NOT_ELIGIBLE', 'Warnings require a saved HIGH or CRITICAL risk assessment.');
    }
    await this.assertAttachments(officerId, assessment.id, input.attachments);
    const incident = this.incidents ? await this.incidents.findById(assessment.incidentId) : null;
    const hazardReportId = incident?.reportIds[0];
    if (!hazardReportId) throw new ApiError(409, 'INVALID_INCIDENT_STATE', 'The assessment incident has no source report.');
    const warning = await this.warnings.create({
      assessmentId: assessment.id, hazardReportId,
      createdById: officerId, riskLevel: assessment.finalRiskLevel, status: 'DRAFT',
      affectedArea: input.affectedArea, requiredAction: input.requiredAction,
      unsafeRoads: input.unsafeRoads, message: input.message,
      ...(input.safeRoutes ? { safeRoutes: input.safeRoutes } : {}),
      attachments: input.attachments ?? []
    });
    return { warning };
  }
  async publish(officerId: string, warningId: string, input: PublishWarningRequest): Promise<PublishWarningResponse> {
    const existing = await this.warnings.findById(warningId);
    if (!existing) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    if (existing.status !== 'DRAFT') throw new ApiError(409, 'WARNING_NOT_DRAFT', 'This warning has already been published.');
    if (!existing.affectedArea.trim()) throw new ApiError(400, 'AFFECTED_AREA_REQUIRED', 'Affected area is required.');
    if (input.notificationTarget.scope === 'DISTRICT' && !WARNING_DISTRICTS.includes(input.notificationTarget.district)) {
      throw new ApiError(400, 'INVALID_NOTIFICATION_TARGET', 'Select a valid district.');
    }
    const published = await this.warnings.publish(
      warningId, officerId, new Date().toISOString(), input.notificationTarget
    );
    if (!published) throw new ApiError(409, 'WARNING_NOT_DRAFT', 'This warning has already been published.');
    // Publication is authoritative. Notification processing may fail later and must not
    // make a successfully published warning look like a draft again.
    void Promise.resolve().then(() => this.onPublished?.(published)).catch(() => undefined);
    return { warning: published };
  }
  async get(warningId: string) { return this.warnings.findById(warningId); }
  async getByAssessment(assessmentId: string) { return this.warnings.findByAssessmentId(assessmentId); }

  // LDFEW-115: content edits preserve every relationship by construction — the
  // UpdateWarningInput type excludes assessment/report/incident/risk/status and
  // publication fields, so only whitelisted content fields can be applied.
  async update(officerId: string, warningId: string, input: UpdateWarningRequest): Promise<UpdateWarningResponse> {
    const existing = await this.warnings.findById(warningId);
    if (!existing) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    if (existing.status === 'CANCELLED' || existing.status === 'ARCHIVED') {
      throw new ApiError(409, 'WARNING_NOT_EDITABLE', 'Cancelled or archived warnings cannot be updated.');
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'PUBLISHED') {
      throw new ApiError(409, 'WARNING_NOT_EDITABLE', 'This warning cannot be updated in its current state.');
    }
    // Never trust client-supplied relationships: assessmentId may be echoed by the
    // form for compatibility but is discarded here, so risk assessment, report,
    // incident, creator, risk level, and publication data stay untouched.
    const fields = { ...input };
    delete fields.assessmentId;
    const changes: WarningChanges = {};
    if (fields.affectedArea !== undefined) changes.affectedArea = fields.affectedArea;
    if (fields.requiredAction !== undefined) changes.requiredAction = fields.requiredAction;
    if (fields.unsafeRoads !== undefined) changes.unsafeRoads = fields.unsafeRoads;
    if (fields.safeRoutes !== undefined) changes.safeRoutes = fields.safeRoutes;
    if (fields.message !== undefined) changes.message = fields.message;
    if (fields.attachments !== undefined) {
      await this.assertAttachments(officerId, existing.assessmentId, fields.attachments);
      changes.attachments = fields.attachments;
    }
    const updated = await this.warnings.update(warningId, changes);
    if (!updated) throw new ApiError(409, 'WARNING_NOT_EDITABLE', 'This warning cannot be updated in its current state.');
    if (updated.assessmentId !== existing.assessmentId || updated.hazardReportId !== existing.hazardReportId ||
      updated.createdById !== existing.createdById || updated.riskLevel !== existing.riskLevel) {
      throw new ApiError(500, 'WARNING_RELATIONSHIP_CHANGED', 'Warning relationships must be preserved.');
    }
    return { warning: updated };
  }

  // LDFEW-115: PUBLISHED warnings can be cancelled once; terminal states reject.
  async cancel(officerId: string, warningId: string): Promise<CancelWarningResponse> {
    const existing = await this.warnings.findById(warningId);
    if (!existing) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    if (existing.status === 'CANCELLED') throw new ApiError(409, 'WARNING_ALREADY_CANCELLED', 'This warning has already been cancelled.');
    if (existing.status === 'ARCHIVED') throw new ApiError(409, 'WARNING_ALREADY_ARCHIVED', 'Archived warnings cannot be cancelled.');
    if (existing.status !== 'DRAFT' && existing.status !== 'PUBLISHED') {
      throw new ApiError(409, 'WARNING_INVALID_TRANSITION', 'This warning cannot be cancelled in its current state.');
    }
    const updated = await this.warnings.cancel(warningId, officerId, new Date().toISOString());
    if (!updated) throw new ApiError(409, 'WARNING_INVALID_TRANSITION', 'This warning cannot be cancelled in its current state.');
    return { warning: updated };
  }

  // LDFEW-115: any non-archived warning can be archived once.
  async archive(officerId: string, warningId: string): Promise<ArchiveWarningResponse> {
    const existing = await this.warnings.findById(warningId);
    if (!existing) throw new ApiError(404, 'WARNING_NOT_FOUND', 'Warning not found.');
    if (existing.status === 'ARCHIVED') throw new ApiError(409, 'WARNING_ALREADY_ARCHIVED', 'This warning has already been archived.');
    const updated = await this.warnings.archive(warningId, officerId, new Date().toISOString());
    if (!updated) throw new ApiError(409, 'WARNING_ALREADY_ARCHIVED', 'This warning has already been archived.');
    return { warning: updated };
  }

  private async assertAttachments(officerId: string, assessmentId: string, references?: string[]): Promise<void> {
    if (!references || references.length === 0) return;
    for (const reference of references) {
      const match = /^\/api\/v1\/warning-attachments\/([a-f\d]{24})$/i.exec(reference);
      if (match) {
        const image = await this.images.findById(match[1]);
        if (!image || image.createdById !== officerId || image.assessmentId !== assessmentId) {
          throw new ApiError(400, 'INVALID_ATTACHMENT', 'Each attached image must be uploaded by you for this assessment.');
        }
      }
    }
  }
}
