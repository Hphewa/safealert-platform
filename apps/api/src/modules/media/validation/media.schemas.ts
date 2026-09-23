export const reportEvidenceFieldName = 'file';

export const supportedReportEvidenceContentTypes = ['image/jpeg', 'image/png'] as const;

export type SupportedReportEvidenceContentType = (typeof supportedReportEvidenceContentTypes)[number];

export const reportEvidenceFileSizeLimitBytes = 5 * 1024 * 1024;

export function isSupportedReportEvidenceContentType(
  contentType: string
): contentType is SupportedReportEvidenceContentType {
  return supportedReportEvidenceContentTypes.includes(
    contentType as SupportedReportEvidenceContentType
  );
}
