import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getWarning, publishWarning } from '../api/warningApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentStyles } from '../components/RiskAssessmentComponents';
import { WarningPage, warningStyles } from '../components/WarningComponents';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { warningPublishErrorMessage } from '../riskAssessmentForm';

export function PublishWarningScreen() {
  const { accessToken } = useAuth(); const router = useRouter();
  const params = useLocalSearchParams<{ warningId?: string | string[] }>();
  const warningId = Array.isArray(params.warningId) ? params.warningId[0] : params.warningId;
  const [confirming, setConfirming] = useState(false); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accessToken || !warningId) throw new Error('A warning reference is required.');
    return getWarning(warningId, accessToken);
  }, [accessToken, warningId]);
  const resource = useAssessmentResource(load); const warning = resource.data?.warning;
  const publish = async () => { if (!accessToken || !warningId || busy) return; setBusy(true); setError(null); try { await publishWarning(warningId, accessToken); setSaved(true); } catch (failure) { setError(warningPublishErrorMessage(failure)); } finally { setBusy(false); } };
  return <WarningPage title={saved ? 'Warning Published!' : 'Publish Warning'} onBack={() => router.back()} busy={busy}>
    {!warning ? <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} /> : saved ? <View style={warningStyles.success}>
      <Text style={warningStyles.successTitle}>Warning Published!</Text><AssessmentDetail label="Status" value="PUBLISHED" /><AssessmentDetail label="Affected Area" value={warning.affectedArea} /><AssessmentDetail label="Published At" value={new Date().toLocaleString()} /><AssessmentButton label="View Warning" onPress={() => router.replace({ pathname: '/officer/warnings/[warningId]', params: { warningId } })} />
    </View> : <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>Warning details</Text><AssessmentDetail label="Affected Area" value={warning.affectedArea} /><Text style={assessmentStyles.label}>Risk Level</Text><PriorityBadge priority={warning.riskLevel} /><AssessmentDetail label="Required Action" value={warning.requiredAction} /><AssessmentDetail label="Reason / Message" value={warning.message} /><AssessmentDetail label="Target audience" value={warning.affectedArea} /><AssessmentDetail label="Current status" value={warning.status} />
      {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
      {warning.status === 'DRAFT' ? !warning.affectedArea.trim() ? <Text accessibilityRole="alert" style={assessmentStyles.error}>Affected area is required.</Text> : confirming ? <><Text style={warningStyles.notice}>Publish this warning to the targeted area?</Text><AssessmentButton label="Cancel" secondary disabled={busy} onPress={() => setConfirming(false)} /><AssessmentButton label={busy ? 'Publishing…' : 'Confirm & Publish'} disabled={busy} onPress={() => void publish()} /></> : <AssessmentButton label="Publish Warning" disabled={busy} onPress={() => setConfirming(true)} /> : <Text accessibilityRole="alert" style={assessmentStyles.error}>This warning has already been published.</Text>}
    </View>}
  </WarningPage>;
}
