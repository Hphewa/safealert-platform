import {
  REPORT_VOICE_MAX_DURATION_SECONDS,
  type ReportVoiceEvidence,
  type ReportVoiceMimeType
} from '@safealert/contracts';

export const reportVoiceMaxDurationSeconds = REPORT_VOICE_MAX_DURATION_SECONDS;
export const defaultVoiceEvidenceContentType: ReportVoiceMimeType = 'audio/mp4';

export type LocalVoiceEvidence = {
  localUri: string;
  fileName: string;
  mimeType: ReportVoiceMimeType;
  durationSeconds: number;
  uploadedMediaReference: string | null;
};

export function clampVoiceDurationSeconds(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.ceil(durationSeconds)), reportVoiceMaxDurationSeconds);
}

export function formatVoiceDuration(durationSeconds: number) {
  const totalSeconds = clampVoiceDurationSeconds(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function toReportVoiceEvidence(
  localVoice: LocalVoiceEvidence,
  mediaReference: string
): ReportVoiceEvidence {
  return {
    mediaReference,
    contentType: localVoice.mimeType,
    durationSeconds: clampVoiceDurationSeconds(localVoice.durationSeconds)
  };
}
