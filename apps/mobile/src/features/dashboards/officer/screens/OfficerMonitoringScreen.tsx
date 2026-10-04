import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IncidentMonitoringSummary } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { listIncidentMonitoring } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentTime } from '../incidentGrouping';
import { dashboardTheme } from '../../shared/theme';

export function OfficerMonitoringScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (): Promise<IncidentMonitoringSummary[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return (await listIncidentMonitoring(accessToken)).incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };

  return <DashboardScreen bottomNavItems={officerBottomNavItems}
    refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={dashboardTheme.colors.primary} />}>
    <Text style={assessmentStyles.title}>Monitoring</Text>
    <Text style={assessmentStyles.helper}>Track assessed incidents and verified evidence.</Text>
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {data?.length === 0 ? <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.body}>No assessed incidents are currently available for monitoring.</Text>
    </View> : null}
    {data?.map((item) => <MonitoringCard key={item.incident.id} item={item} onOpen={() => router.push({
      pathname: '/officer/monitoring/[incidentId]', params: { incidentId: item.incident.id }
    })} />)}
  </DashboardScreen>;
}

function MonitoringCard({ item, onOpen }: { item: IncidentMonitoringSummary; onOpen: () => void }) {
  const assessment = item.currentAssessment ?? item.latestAssessment;
  const current = Boolean(item.currentAssessment);
  const evidenceTime = item.latestVerifiedReportAt ? formatIncidentTime(item.latestVerifiedReportAt) : 'Time unavailable';
  return <View style={styles.card}>
    <View style={styles.titleRow}>
      <Text style={assessmentStyles.heading}>{assessmentLabel(item.incident.hazardType)} Incident</Text>
      <StatusBadge label={item.incident.status} tone={item.incident.status === 'ACTIVE' ? 'info' : 'neutral'} />
    </View>
    <HumanReadableLocation location={item.incident.location} style={styles.location} />
    {assessment ? <View style={styles.risk}>
      <Text style={assessmentStyles.label}>{current ? 'CURRENT RISK' : 'LATEST ASSESSMENT'}</Text>
      <PriorityBadge priority={assessment.finalRiskLevel} />
      <Text style={assessmentStyles.body}>Assessment status: {assessment.status}</Text>
      <Text style={assessmentStyles.helper}>Score: {assessment.calculatedScore}</Text>
    </View> : <Text style={assessmentStyles.body}>No active risk assessment</Text>}
    <View style={styles.evidence}>
      <Text style={assessmentStyles.body}>Verified reports: {item.totalVerifiedReports}</Text>
      <Text style={assessmentStyles.helper}>{item.newVerifiedReportsSinceAssessment} new verified {item.newVerifiedReportsSinceAssessment === 1 ? 'report' : 'reports'}</Text>
      {item.hasNewVerifiedEvidence ? <Text style={styles.newEvidence}>NEW VERIFIED EVIDENCE</Text> : null}
      <Text style={assessmentStyles.helper}>Latest verified evidence: {evidenceTime}</Text>
    </View>
    <AssessmentButton label="View Monitoring" onPress={onOpen} />
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  titleRow: { gap: 8, alignItems: 'flex-start' },
  location: { color: dashboardTheme.colors.text, fontSize: 15, lineHeight: 21 },
  risk: { gap: 5, paddingTop: 4 },
  evidence: { gap: 5, borderTopWidth: 1, borderColor: dashboardTheme.colors.border, paddingTop: 10 },
  newEvidence: { color: dashboardTheme.colors.high, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 }
});
