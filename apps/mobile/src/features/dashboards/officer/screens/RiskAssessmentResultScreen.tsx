import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessment } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import {
  AssessmentButton, AssessmentDetail, AssessmentFactorSummary, AssessmentLoadState, AssessmentPage,
  ReportAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';

export function RiskAssessmentResultScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('An assessment reference is required.');
    // Always retrieve persisted state, including when opening this route directly.
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  return <AssessmentPage title="Risk Assessment Result">
    {!data ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : <>
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Saved assessment · {data.assessment.status}</Text>
        <Text style={assessmentStyles.label}>System Suggested Risk</Text>
        <PriorityBadge priority={data.assessment.systemSuggestedRisk} />
        <Text style={assessmentStyles.label}>Final Risk Level</Text>
        <PriorityBadge priority={data.assessment.finalRiskLevel} />
        <AssessmentDetail label="Calculated Score" value={data.assessment.calculatedScore} />
        <AssessmentDetail label="Decision Reason" value={data.assessment.decisionReason ?? 'Suggested risk accepted without an additional reason.'} />
        <AssessmentDetail label="Assessment Date / Time" value={new Date(data.assessment.assessedAt).toLocaleString()} />
        <AssessmentDetail label="Assessed By" value={user?.id === data.assessment.assessedById ? user.name : data.assessment.assessedById} />
        <AssessmentDetail label="Assessment Reference" value={data.assessment.id} />
      </View>
      {canCreateWarning(data.assessment.finalRiskLevel) ? <AssessmentButton label="Create Warning" onPress={() => router.push({
        pathname: '/officer/warnings/create', params: { assessmentId: data.assessment.id }
      })} /> : null}
      <AssessmentFactorSummary factors={data.assessment} />
      <ReportAssessmentContext report={data.report} />
    </>}
  </AssessmentPage>;
}
