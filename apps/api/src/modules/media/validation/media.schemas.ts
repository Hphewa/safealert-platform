import { REPORT_VOICE_MAX_BYTES, REPORT_VOICE_MIME_TYPES } from '@safealert/contracts';

export const reportEvidenceFieldName = 'file';

export const reportEvidenceImageContentTypes = ['image/jpeg', 'image/png'] as const;
export const reportEvidenceVoiceContentTypes = REPORT_VOICE_MIME_TYPES;
export const supportedReportEvidenceContentTypes = [
  ...reportEvidenceImageContentTypes,
  ...reportEvidenceVoiceContentTypes
] as const;

export type SupportedReportEvidenceContentType = (typeof supportedReportEvidenceContentTypes)[number];
export type ReportEvidenceImageContentType = (typeof reportEvidenceImageContentTypes)[number];
export type ReportEvidenceVoiceContentType = (typeof reportEvidenceVoiceContentTypes)[number];

export const reportEvidenceImageFileSizeLimitBytes = 5 * 1024 * 1024;
export const reportEvidenceVoiceFileSizeLimitBytes = REPORT_VOICE_MAX_BYTES;
export const reportEvidenceFileSizeLimitBytes = Math.max(
  reportEvidenceImageFileSizeLimitBytes,
  reportEvidenceVoiceFileSizeLimitBytes
);

export function isSupportedReportEvidenceContentType(
  contentType: string
): contentType is SupportedReportEvidenceContentType {
  return supportedReportEvidenceContentTypes.includes(
    contentType as SupportedReportEvidenceContentType
  );
}

export function isReportEvidenceImageContentType(
  contentType: string
): contentType is ReportEvidenceImageContentType {
  return reportEvidenceImageContentTypes.includes(contentType as ReportEvidenceImageContentType);
}

export function isReportEvidenceVoiceContentType(
  contentType: string
): contentType is ReportEvidenceVoiceContentType {
  return reportEvidenceVoiceContentTypes.includes(contentType as ReportEvidenceVoiceContentType);
}

export function reportEvidenceFileSizeLimitFor(contentType: SupportedReportEvidenceContentType) {
  return isReportEvidenceVoiceContentType(contentType)
    ? reportEvidenceVoiceFileSizeLimitBytes
    : reportEvidenceImageFileSizeLimitBytes;
}
