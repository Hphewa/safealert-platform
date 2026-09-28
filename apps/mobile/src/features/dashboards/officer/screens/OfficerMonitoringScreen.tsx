import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IncidentMonitoringSummary } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { listIncidentMonitoring } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';

export function OfficerMonitoringScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const load = useCallback(async (): Promise<IncidentMonitoringSummary[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return (await listIncidentMonitoring(accessToken)).incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Monitoring</Text>
    <Text style={assessmentStyles.helper}>Track assessed incidents and verified evidence.</Text>
    <AssessmentButton label="Refresh monitoring" secondary disabled={loading} onPress={() => void reload()} />
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {data?.length === 0 ? <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.body}>No assessed incidents are currently available for monitoring.</Text>
    </View> : null}
    {data?.map((item) => {
      const assessment = item.currentAssessment ?? item.latestAssessment;
      return <View key={item.incident.id} style={assessmentStyles.card}>
        <Text style={assessmentStyles.label}>INCIDENT · {item.incident.status}</Text>
        <Text style={assessmentStyles.heading}>{assessmentLabel(item.incident.hazardType)}</Text>
        <Text style={assessmentStyles.helper}>Location: {formatIncidentLocation(item.incident.location)}</Text>
        {assessment ? <>
          <Text style={assessmentStyles.label}>{item.currentAssessment ? 'CURRENT RISK' : 'LATEST ASSESSMENT'}</Text>
          <PriorityBadge priority={assessment.finalRiskLevel} />
          <Text style={assessmentStyles.body}>Assessment status: {assessment.status}</Text>
        </> : <Text style={assessmentStyles.body}>No active risk assessment</Text>}
        <Text style={assessmentStyles.helper}>Verified reports: {item.totalVerifiedReports}</Text>
        <Text style={assessmentStyles.helper}>{item.newVerifiedReportsSinceAssessment} new verified {item.newVerifiedReportsSinceAssessment === 1 ? 'report' : 'reports'}</Text>
        {item.hasNewVerifiedEvidence ? <Text style={assessmentStyles.label}>NEW VERIFIED EVIDENCE</Text> : null}
        <Text style={assessmentStyles.helper}>Latest verified evidence: {item.latestVerifiedReportAt ? formatIncidentTime(item.latestVerifiedReportAt) : 'Time unavailable'}</Text>
        <AssessmentButton label="View monitoring details" onPress={() => router.push({
          pathname: '/officer/monitoring/[incidentId]', params: { incidentId: item.incident.id }
        })} />
      </View>;
    })}
  </DashboardScreen>;
}
