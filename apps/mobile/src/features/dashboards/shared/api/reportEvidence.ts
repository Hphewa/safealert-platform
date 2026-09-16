import { REPORT_EVIDENCE_REFERENCE_PREFIX, type GetReportEvidenceResponse } from '@safealert/contracts';
import { apiRequest } from '../../../../services/api/client';

export function reportEvidenceUri(report: { id: string; mediaReference?: string }): string | undefined {
  if (report.mediaReference?.startsWith(REPORT_EVIDENCE_REFERENCE_PREFIX)) {
    return `/reports/${encodeURIComponent(report.id)}/evidence`;
  }
  return report.mediaReference && /^(https?:\/\/|data:image\/)/i.test(report.mediaReference)
    ? report.mediaReference : undefined;
}

export async function loadReportEvidence(uri: string, accessToken: string | null): Promise<string> {
  if (/^\/reports\/[^/]+\/evidence$/.test(uri)) {
    const response = await apiRequest<GetReportEvidenceResponse>(uri, { accessToken });
    if (!response?.dataUri?.startsWith('data:image/')) {
      throw new Error('The report photo could not be loaded.');
    }
    return response.dataUri;
  }
  if (/^(https?:\/\/|data:image\/)/i.test(uri)) return uri;
  throw new Error('This report does not have an uploaded photo.');
}
