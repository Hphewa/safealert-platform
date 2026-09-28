import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IncidentWithReportsResponse } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { listInitialAssessmentQueue } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';
import { latestIncidentReportAt } from '../assessmentIncidents';

export function OfficerRiskAssessmentsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const load = useCallback(async (): Promise<IncidentWithReportsResponse[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    const { incidents } = await listInitialAssessmentQueue(accessToken);
    return incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);

  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Risk Assessments</Text>
    <Text style={assessmentStyles.helper}>Select an eligible incident to complete its initial risk assessment.</Text>
    <AssessmentButton label="Refresh incidents" secondary disabled={loading} onPress={() => void reload()} />
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {data?.length === 0 ? <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>No incidents currently require an initial risk assessment.</Text>
      <AssessmentButton label="Open Incident Grouping" onPress={() => router.push('/officer/incidents')} />
    </View> : null}
    {data?.map((incident) => <View key={incident.incident.id} style={assessmentStyles.card}>
      <Text style={assessmentStyles.label}>INCIDENT</Text>
      <Text style={assessmentStyles.heading}>{assessmentLabel(incident.incident.hazardType)}</Text>
      <Text style={assessmentStyles.helper}>Location: {formatIncidentLocation(incident.incident.location)}</Text>
      <Text style={assessmentStyles.helper}>Verified Reports: {incident.reports.length}</Text>
      <Text style={assessmentStyles.helper}>Latest Report Time: {formatIncidentTime(latestIncidentReportAt(incident) ?? '')}</Text>
      <AssessmentButton label="ASSESS RISK" onPress={() => router.push({
        pathname: '/officer/assessments/create', params: { incidentId: incident.incident.id }
      })} />
      <Text style={assessmentStyles.helper}>Risk preparation belongs to this incident; its reports remain source evidence.</Text>
    </View>)}
  </DashboardScreen>;
}
