import { canCreateWarning, type CreateWarningRequest, type CreateWarningResponse } from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { WarningRepository } from '../repositories/warning.repository.js';
import type { WarningAttachmentRepository } from '../repositories/warningAttachment.repository.js';

export class WarningService {
  constructor(private readonly warnings: WarningRepository, private readonly assessments: RiskAssessmentRepository,
    private readonly images: WarningAttachmentRepository) {}

  async create(officerId: string, input: CreateWarningRequest): Promise<CreateWarningResponse> {
    const assessment = await this.assessments.findById(input.assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    if (!canCreateWarning(assessment.finalRiskLevel)) {
      throw new ApiError(409, 'WARNING_RISK_NOT_ELIGIBLE', 'Warnings require a saved HIGH or CRITICAL risk assessment.');
    }
    for (const reference of input.attachments ?? []) {
      const image = await this.images.findById(reference.split('/').pop()!);
      if (!image || image.createdById !== officerId || image.assessmentId !== assessment.id) {
        throw new ApiError(400, 'INVALID_ATTACHMENT', 'Choose and upload your images for this assessment before saving.');
      }
    }
    const warning = await this.warnings.create({
      assessmentId: assessment.id, hazardReportId: assessment.hazardReportId,
      createdById: officerId, riskLevel: assessment.finalRiskLevel, status: 'DRAFT',
      affectedArea: input.affectedArea, requiredAction: input.requiredAction,
      unsafeRoads: input.unsafeRoads, message: input.message,
      ...(input.safeRoutes ? { safeRoutes: input.safeRoutes } : {}),
      attachments: input.attachments ?? []
    });
    return { warning };
  }
}
