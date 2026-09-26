import {
  canCreateWarning, WARNING_DISTRICTS,
  type CreateWarningRequest, type CreateWarningResponse, type PublishWarningRequest,
  type PublishWarningResponse, type SafeWarning
} from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { IncidentRepository } from '../../incidents/repositories/incident.repository.js';
import type { WarningRepository } from '../repositories/warning.repository.js';
import type { WarningAttachmentRepository } from '../repositories/warningAttachment.repository.js';

export type WarningPublishedHandler = (warning: SafeWarning) => Promise<void> | void;

export class WarningService {
  constructor(private readonly warnings: WarningRepository, private readonly assessments: RiskAssessmentRepository,
    private readonly images: WarningAttachmentRepository, private readonly incidents?: IncidentRepository,
    private readonly onPublished?: WarningPublishedHandler) {}

  async create(officerId: string, input: CreateWarningRequest): Promise<CreateWarningResponse> {
    const assessment = await this.assessments.findById(input.assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    if (!canCreateWarning(assessment.finalRiskLevel)) {
      throw new ApiError(409, 'WARNING_RISK_NOT_ELIGIBLE', 'Warnings require a saved HIGH or CRITICAL risk assessment.');
    }
    for (const reference of input.attachments ?? []) {
      if (/^https?:\/\//i.test(reference)) continue;
      const image = await this.images.findById(reference.split('/').pop()!);
      if (!image || image.createdById !== officerId || image.assessmentId !== assessment.id) {
        throw new ApiError(400, 'INVALID_ATTACHMENT', 'Choose and upload your images for this assessment before saving.');
      }
    }
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
}
