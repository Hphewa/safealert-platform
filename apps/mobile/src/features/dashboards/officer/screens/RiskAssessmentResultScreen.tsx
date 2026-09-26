import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning, type SafeRiskAssessment, type SafeUser } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessment, getRiskAssessmentHistory } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { dashboardTheme } from '../../shared/theme';
import {
  AssessmentButton, AssessmentDetail, AssessmentFactorSummary, AssessmentLoadState, AssessmentPage,
  IncidentAssessmentContext, assessmentStyles
} from '../components/RiskAssessmentComponents';

type AssessmentHistoryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; assessments: SafeRiskAssessment[] };

export function RiskAssessmentResultScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [historyState, setHistoryState] = useState<AssessmentHistoryState>({ kind: 'loading' });
  const [historyRetry, setHistoryRetry] = useState(0);
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('An assessment reference is required.');
    // Always retrieve persisted state, including when opening this route directly.
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  useEffect(() => {
    if (!data) return;
    let isActive = true;
    setHistoryState({ kind: 'loading' });
    if (!accessToken) {
      setHistoryState({ kind: 'error' });
      return () => { isActive = false; };
    }

    void getRiskAssessmentHistory(data.assessment.incidentId, accessToken)
      .then(({ assessments }) => {
        if (isActive) setHistoryState({ kind: 'loaded', assessments });
      })
      .catch(() => {
        if (isActive) setHistoryState({ kind: 'error' });
      });
    return () => { isActive = false; };
  }, [data, accessToken, historyRetry]);
  const retryHistory = useCallback(() => setHistoryRetry((retry) => retry + 1), []);
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
      {canCreateWarning(data.assessment.finalRiskLevel) ? <AssessmentButton label="Create Warning" onPress={() => router.push({
        pathname: '/officer/warnings/create', params: { assessmentId: data.assessment.id }
      })} /> : null}
      {data.assessment.status === 'ACTIVE' ? <AssessmentButton label="REASSESS RISK" onPress={() => router.push({
        pathname: '/officer/assessments/create', params: { assessmentId: data.assessment.id }
      })} /> : null}
      <AssessmentFactorSummary factors={data.assessment} />
      <IncidentAssessmentContext incident={data.incident} reports={data.reports} />
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>System suggested risk</Text>
        <PriorityBadge priority={data.assessment.systemSuggestedRisk} />
        <AssessmentDetail label="System Calculated Score" value={data.assessment.calculatedScore} />
        <Text style={assessmentStyles.helper}>This backend-calculated recommendation is separate from the final officer decision above.</Text>
      </View>
      <AssessmentHistorySection
        state={historyState}
        officer={user ? { id: user.id, name: user.name } : null}
        onRetry={retryHistory}
      />
    </>}
  </AssessmentPage>;
}

export function AssessmentHistorySection({
  state,
  officer,
  onRetry
}: {
  state: AssessmentHistoryState;
  officer: Pick<SafeUser, 'id' | 'name'> | null;
  onRetry: () => void;
}) {
  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.heading}>Assessment History</Text>
    {state.kind === 'loading' ? <>
      <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
      <Text style={assessmentStyles.helper}>Loading assessment history…</Text>
    </> : state.kind === 'error' ? <>
      <Text accessibilityRole="alert" style={assessmentStyles.error}>Unable to load assessment history.</Text>
      <AssessmentButton label="Retry" onPress={onRetry} />
    </> : state.assessments.length === 0 ? <Text style={assessmentStyles.helper}>
      No assessment history available.
    </Text> : state.assessments.map((assessment) => <View key={assessment.id} style={assessmentStyles.detail}>
      <Text style={assessmentStyles.label}>{assessment.status === 'ACTIVE' ? 'Current' : 'Historical'}</Text>
      <PriorityBadge priority={assessment.finalRiskLevel} />
      <AssessmentDetail label="Calculated Score" value={assessment.calculatedScore} />
      <AssessmentDetail label="Status" value={assessment.status} />
      <AssessmentDetail label="Assessment Date / Time" value={new Date(assessment.assessedAt).toLocaleString()} />
      <AssessmentDetail label="Assessed By" value={officer?.id === assessment.assessedById ? officer.name : assessment.assessedById} />
      {assessment.previousAssessmentId ? <AssessmentDetail label="Previous Assessment" value={assessment.previousAssessmentId} /> : null}
      {assessment.reassessmentReason ? <AssessmentDetail label="Reason for Reassessment" value={assessment.reassessmentReason} /> : null}
      {assessment.closureReason ? <AssessmentDetail label="Closure Reason" value={assessment.closureReason} /> : null}
      {assessment.closedAt ? <AssessmentDetail label="Closed At" value={new Date(assessment.closedAt).toLocaleString()} /> : null}
      {assessment.closedById ? <AssessmentDetail label="Closed By" value={officer?.id === assessment.closedById ? officer.name : assessment.closedById} /> : null}
    </View>)}
  </View>;
}
