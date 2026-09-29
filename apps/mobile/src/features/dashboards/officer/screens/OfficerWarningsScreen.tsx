import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canCreateWarning, type IncidentMonitoringSummary } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { listIncidentMonitoring } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation } from '../incidentGrouping';

export function OfficerWarningsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const load = useCallback(async (): Promise<IncidentMonitoringSummary[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return (await listIncidentMonitoring(accessToken)).incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const eligible = (data ?? []).filter((item) => item.currentAssessment && canCreateWarning(item.currentAssessment.finalRiskLevel));
  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Warnings</Text>
    <Text style={assessmentStyles.helper}>Create, review, and publish warnings from eligible saved risk assessments.</Text>
    <AssessmentButton label="Refresh warnings" secondary disabled={loading} onPress={() => void reload()} />
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {!loading && !error && eligible.length === 0 ? <View style={assessmentStyles.card}><Text style={assessmentStyles.body}>No HIGH or CRITICAL saved assessments currently require warning management.</Text></View> : null}
    {eligible.map((item) => {
      const assessment = item.currentAssessment!;
      const warning = item.warnings.find((candidate) => candidate.assessmentId === assessment.id);
      return <View key={assessment.id} style={assessmentStyles.card}>
        <Text style={assessmentStyles.label}>{warning ? warning.status : 'NEEDS WARNING'}</Text>
        <Text style={assessmentStyles.heading}>{assessmentLabel(item.incident.hazardType)}</Text>
        <Text style={assessmentStyles.helper}>Location: {formatIncidentLocation(item.incident.location)}</Text>
        <PriorityBadge priority={assessment.finalRiskLevel} />
        {warning ? <AssessmentButton label={warning.status === 'PUBLISHED' ? 'View Published Warning' : 'View/Edit Draft'} onPress={() => router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId: warning.id } })} /> : <AssessmentButton label="Create Warning" onPress={() => router.push({ pathname: '/officer/warnings/create', params: { assessmentId: assessment.id } })} />}
      </View>;
    })}
  </DashboardScreen>;
}
