import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { geoJsonPointToMapCoordinates } from '../../shared/maps/types';
import { dashboardTheme } from '../../shared/theme';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';
import { latestIncidentReportAt } from '../assessmentIncidents';
import { formatAssessmentHazard, formatAssessmentRelativeTime } from '../assessmentQueuePresentation';
import { AssessmentFlowBackLink } from '../components/AssessmentFlowBackLink';
import { AssessmentButton, AssessmentLoadState, assessmentStyles } from '../components/RiskAssessmentComponents';
import { VerifiedReportAccordion } from '../components/VerifiedReportAccordion';
import { useIncidentOverview } from '../hooks/useIncidentOverview';
import { NO_VERIFIED_INCIDENT_EVIDENCE } from '../api/incidentOverview';
import { officerBottomNavItems } from '../officerNavigation';

export function IncidentOverviewScreen() {
  const params = useLocalSearchParams<{ incidentId?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const router = useRouter();
  const { resetAssessmentDraft } = useRiskAssessmentDraft();
  const { data, loading, error, reload, starting, startAssessment } = useIncidentOverview(incidentId);
  const context = data?.incident.id === incidentId ? data : null;
  const reports = context?.reports ?? [];
  const severityCounts = new Map<string, number>();
  for (const report of reports) severityCounts.set(report.severity, (severityCounts.get(report.severity) ?? 0) + 1);
  const severitySummary = Array.from(severityCounts, ([severity, count]) => `${formatAssessmentHazard(severity)} (${count})`).join(' · ');
  const relativeEvidence = context ? formatAssessmentRelativeTime(latestIncidentReportAt(context) ?? '').replace(/^Updated /, '') : '';
  const canStart = context?.canStartInitialAssessment === true;

  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <AssessmentFlowBackLink label="Risk Assessments" onPress={() => {
      resetAssessmentDraft();
      router.dismissTo('/officer/assessments');
    }} />
    {!context && !error ? <AssessmentLoadState loading error={null} retry={() => void reload()} /> : null}
    {error ? <View style={styles.section}>
      <Text style={assessmentStyles.heading}>Unable to load incident</Text>
      <AssessmentLoadState loading={loading} error={error === NO_VERIFIED_INCIDENT_EVIDENCE ? error : "We couldn't load the latest incident information. Please try again."}
        retry={() => { if (!loading) void reload(); }} />
    </View> : null}
    {context ? <>
      <View style={styles.section}>
        <Text style={assessmentStyles.title}>{formatAssessmentHazard(context.incident.hazardType)} Incident</Text>
        <StatusBadge label={canStart ? 'NEEDS ASSESSMENT' : context.assessment ? 'ASSESSMENT AVAILABLE' : 'NOT AWAITING INITIAL ASSESSMENT'} tone={canStart ? 'info' : 'neutral'} />
      </View>
      <View style={assessmentStyles.card}>
        <HumanReadableLocation location={context.incident.location} style={styles.location} />
        <Text style={assessmentStyles.body}>{reports.length} verified {reports.length === 1 ? 'report' : 'reports'}</Text>
        <Text style={assessmentStyles.helper}>Latest evidence: {relativeEvidence}</Text>
        <LocationPreview coordinates={geoJsonPointToMapCoordinates(context.incident.location)} height={200} title="Incident location" />
      </View>
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.heading}>Evidence Summary</Text>
        <Text style={assessmentStyles.body}>Reported severity: {severitySummary || 'No verified evidence'}</Text>
        <Text style={assessmentStyles.helper}>Severity reported by residents; this is not the official officer risk level.</Text>
      </View>
      <View style={styles.section}>
        <Text style={assessmentStyles.heading}>Verified Reports ({reports.length})</Text>
        {reports.length === 0 ? <Text style={assessmentStyles.helper}>This incident has no verified reports available. Return to Assessments for the latest queue.</Text> : null}
        {reports.map((report, index) => <VerifiedReportAccordion key={report.id} report={report} index={index + 1} />)}
      </View>
      {!canStart ? <View style={assessmentStyles.card}>
        <Text accessibilityRole="alert" style={assessmentStyles.body}>{context.assessment
          ? 'An assessment already exists for this incident. Open it to review the latest decision.'
          : context.incident.status !== 'ACTIVE' ? 'This incident is no longer active.'
            : 'This incident is no longer waiting for an initial assessment. Return to Assessments for the latest queue.'}</Text>
        {context.assessment ? <AssessmentButton label="View assessment" secondary onPress={() => router.push({
          pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: context.assessment!.id }
        })} /> : null}
        {!context.assessment && reports.length > 0 ? <AssessmentButton label="View Monitoring" secondary onPress={() => router.push('/officer/monitoring')} /> : null}
      </View> : null}
      <AssessmentButton label={starting ? 'Checking latest incident...' : 'START ASSESSMENT'}
        disabled={!canStart || loading || starting || Boolean(error)} onPress={startAssessment} />
    </> : null}
  </DashboardScreen>;
}
const styles = StyleSheet.create({
  section: { gap: 12 },
  location: { fontSize: 17, fontWeight: '700', color: dashboardTheme.colors.text }
});
