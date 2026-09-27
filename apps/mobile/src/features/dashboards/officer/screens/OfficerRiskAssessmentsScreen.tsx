import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessmentForIncident, getRiskAssessmentHistory } from '../api/riskAssessmentApi';
import { listActiveIncidents } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';
import { latestIncidentReportAt, type IncidentAssessmentRow } from '../assessmentIncidents';
import { assessmentErrorMessage } from '../riskAssessmentForm';

export function OfficerRiskAssessmentsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ refresh?: string | string[] }>();
  // The result screen replaces this route with a new token so the assessment
  // status is fetched again instead of leaving a stale "Not assessed" card.
  const refresh = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    const { incidents } = await listActiveIncidents(accessToken);
    return Promise.all(incidents.map(async (incident): Promise<IncidentAssessmentRow> => {
      try {
        const { assessment } = await getRiskAssessmentForIncident(incident.incident.id, accessToken);
        if (assessment) return { incident, assessment };
        const { assessments } = await getRiskAssessmentHistory(incident.incident.id, accessToken);
        return { incident, assessment: assessments[0] ?? null };
      } catch (failure) {
        // A failed lookup is unknown state, not permission to create another assessment.
        return { incident, assessment: null, error: assessmentErrorMessage(failure) };
      }
    }));
  }, [accessToken, refresh]);
  const { data, loading, error, reload } = useAssessmentResource(load);

  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Risk Assessments</Text>
    <Text style={assessmentStyles.helper}>Select an Incident to assess its combined verified evidence or view its saved decision.</Text>
    <AssessmentButton label="Refresh incidents" secondary disabled={loading} onPress={() => void reload()} />
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {data?.length === 0 ? <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>No active incidents ready for assessment</Text>
      <Text style={assessmentStyles.body}>Group a VERIFIED report into an Incident before preparing a risk assessment.</Text>
      <AssessmentButton label="Open Incident Grouping" onPress={() => router.push('/officer/incidents')} />
    </View> : null}
    {data?.map((row) => <IncidentAssessmentCard
      key={row.incident.incident.id}
      row={row}
      onAssess={() => {
        router.push({ pathname: '/officer/assessments/create', params: { incidentId: row.incident.incident.id } });
      }}
      onView={() => {
        if (row.assessment) {
          router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: row.assessment.id } });
        }
      }}
    />)}
  </DashboardScreen>;
}

function IncidentAssessmentCard({
  row,
  onAssess,
  onView
}: {
  row: IncidentAssessmentRow;
  onAssess: () => void;
  onView: () => void;
}) {
  const latestReportAt = latestIncidentReportAt(row.incident);

  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.label}>INCIDENT</Text>
    <Text style={assessmentStyles.heading}>{assessmentLabel(row.incident.incident.hazardType)}</Text>
    <Text style={assessmentStyles.helper}>Location: {formatIncidentLocation(row.incident.incident.location)}</Text>
    <Text style={assessmentStyles.helper}>Verified Reports: {row.incident.incident.reportIds.length}</Text>
    <Text style={assessmentStyles.helper}>Latest Report Time: {latestReportAt ? formatIncidentTime(latestReportAt) : 'Time unavailable'}</Text>
    <Text style={assessmentStyles.label}>Assessment Status</Text>
    {row.error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{row.error} Use Refresh incidents to retry.</Text> : row.assessment ? <>
      <Text style={assessmentStyles.body}>{row.assessment.status}</Text>
      <PriorityBadge priority={row.assessment.finalRiskLevel} />
      <AssessmentButton label={row.assessment.status === 'ACTIVE' ? 'VIEW ASSESSMENT' : 'VIEW HISTORY'} onPress={onView} />
    </> : <>
      <Text style={assessmentStyles.body}>No current assessment</Text>
      <AssessmentButton label="ASSESS INCIDENT" onPress={onAssess} />
    </>}
    <Text style={assessmentStyles.helper}>Risk preparation belongs to this Incident; its reports remain source evidence.</Text>
  </View>;
}
