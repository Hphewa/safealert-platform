import { canCreateWarning, WARNING_IMAGE_MAX_BYTES, type UploadWarningImageRequest, type UploadWarningImageResponse, type WarningImageMimeType } from '@safealert/contracts';
import { ApiError } from '../../../shared/apiError.js';
import type { RiskAssessmentRepository } from '../../risk-assessments/repositories/riskAssessment.repository.js';
import type { WarningAttachmentRepository } from '../repositories/warningAttachment.repository.js';

export function detectWarningImageType(bytes: Buffer): WarningImageMimeType | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export class WarningAttachmentService {
  constructor(private readonly images: WarningAttachmentRepository, private readonly assessments: RiskAssessmentRepository) {}
  async upload(createdById: string, input: UploadWarningImageRequest): Promise<UploadWarningImageResponse> {
    const assessment = await this.assessments.findById(input.assessmentId);
    if (!assessment) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Risk assessment not found.');
    if (!canCreateWarning(assessment.finalRiskLevel)) throw new ApiError(409, 'WARNING_RISK_NOT_ELIGIBLE', 'Warnings require a saved HIGH or CRITICAL risk assessment.');
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > WARNING_IMAGE_MAX_BYTES) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Each image must be 5 MB or smaller.');
    const mimeType = detectWarningImageType(bytes);
    if (!mimeType) throw new ApiError(400, 'UNSUPPORTED_IMAGE', 'Choose a JPEG, PNG, or WebP image.');
    const image = await this.images.create({ bytes, mimeType, createdById, assessmentId: assessment.id });
    return { reference: `/api/v1/warning-attachments/${image.id}` };
  }
  async read(officerId: string, id: string) {
    const image = await this.images.findById(id);
    if (!image || image.createdById !== officerId) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Image not found.');
    return { bytes: await this.images.read(id), mimeType: image.mimeType };
  }
}
