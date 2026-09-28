import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning, type SafeWarning } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessment } from '../api/riskAssessmentApi';
import { getWarningByAssessment } from '../api/warningApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import {
  AssessmentButton, AssessmentDetail, AssessmentFactorSummary, AssessmentLoadState, AssessmentPage,
  IncidentAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';

export function RiskAssessmentResultScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const [existingWarning, setExistingWarning] = useState<SafeWarning | null>(null);
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('An assessment reference is required.');
    // Always retrieve persisted state, including when opening this route directly.
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  useEffect(() => { if (!accessToken || !assessmentId) return; void getWarningByAssessment(assessmentId, accessToken).then(result => setExistingWarning(result.warning)).catch(() => setExistingWarning(null)); }, [accessToken, assessmentId]);
  return <AssessmentPage title="Risk Assessment Result">
    {!data ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : <>
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Saved assessment · {data.assessment.status}</Text>
        <Text style={assessmentStyles.label}>Final Risk Level</Text>
        <PriorityBadge priority={data.assessment.finalRiskLevel} />
        <AssessmentDetail label="Decision Reason" value={data.assessment.decisionReason ?? 'Suggested risk accepted without an additional reason.'} />
        <AssessmentDetail label="Assessment Date / Time" value={new Date(data.assessment.assessedAt).toLocaleString()} />
        <AssessmentDetail label="Assessed By" value={user?.id === data.assessment.assessedById ? user.name : data.assessment.assessedById} />
        <AssessmentDetail label="Assessment Reference" value={data.assessment.id} />
      </View>
      {canCreateWarning(data.assessment.finalRiskLevel) ? existingWarning ? <AssessmentButton label={existingWarning.status === 'PUBLISHED' ? 'View Published Warning' : 'View/Edit Draft'} onPress={() => router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId: existingWarning.id } })} /> : <AssessmentButton label="Create Warning" onPress={() => router.push({
        pathname: '/officer/warnings/create', params: { assessmentId: data.assessment.id }
      })} /> : null}
      <AssessmentFactorSummary factors={data.assessment} />
      <IncidentAssessmentContext incident={data.incident} reports={data.reports} />
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>System suggested risk</Text>
        <PriorityBadge priority={data.assessment.systemSuggestedRisk} />
        <AssessmentDetail label="System Calculated Score" value={data.assessment.calculatedScore} />
        <Text style={assessmentStyles.helper}>This backend-calculated recommendation is separate from the final officer decision above.</Text>
      </View>
    </>}
  </AssessmentPage>;
}
