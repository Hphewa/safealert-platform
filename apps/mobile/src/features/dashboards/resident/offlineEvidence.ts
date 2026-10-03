import { Directory, File, Paths } from 'expo-file-system';

import type { ReportHazardDraft } from './reportDraft';

const evidenceDirectoryName = 'safealert-offline-evidence';

export async function prepareDraftForOffline(draft: ReportHazardDraft, operationId: string) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return draft;

  const directory = new Directory(Paths.document, evidenceDirectoryName);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });

  const photoEvidence = draft.photoEvidence.status === 'LOCAL_SELECTED'
    ? { ...draft.photoEvidence, selected: { ...draft.photoEvidence.selected, localUri: await copyEvidenceFile(draft.photoEvidence.selected.localUri, directory, `${operationId}-photo`) } }
    : draft.photoEvidence;
  const voiceEvidence = draft.voiceEvidence.status === 'LOCAL_SELECTED'
    ? { ...draft.voiceEvidence, selected: { ...draft.voiceEvidence.selected, localUri: await copyEvidenceFile(draft.voiceEvidence.selected.localUri, directory, `${operationId}-voice`) } }
    : draft.voiceEvidence;

  return { ...draft, photoEvidence, voiceEvidence };
}

async function copyEvidenceFile(uri: string, directory: Directory, baseName: string) {
  if (!uri.startsWith('file:') || uri.startsWith(directory.uri)) return uri;

  const source = new File(uri);
  if (!source.exists) return uri;

  const destination = new File(directory, `${baseName}${source.extension || '.bin'}`);
  await source.copy(destination);
  return destination.uri;
}
