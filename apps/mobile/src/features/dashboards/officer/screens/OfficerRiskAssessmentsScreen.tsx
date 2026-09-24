import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessmentForReport, listVerifiedOfficerReports } from '../api/riskAssessmentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import {
  AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles
} from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { officerBottomNavItems } from '../mockData';

export function OfficerRiskAssessmentsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    const { reports } = await listVerifiedOfficerReports(accessToken);
    // Resolve active assessments before choosing an action; never assume absence after a failed lookup.
    return Promise.all(reports.map((report) => getRiskAssessmentForReport(report.id, accessToken)));
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Risk Assessments</Text>
    <Text style={assessmentStyles.helper}>Select a verified report to assess its risk or view the saved decision.</Text>
    <AssessmentButton label="Refresh reports" secondary disabled={loading} onPress={() => void reload()} />
    {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}
    {data?.length === 0 ? <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>No verified reports</Text>
      <Text style={assessmentStyles.body}>Review and verify a pending report before assessing risk.</Text>
      <AssessmentButton label="Open Pending Reports" onPress={() => router.push('/officer/reports')} />
    </View> : null}
    {data?.map(({ report, assessment }) => <View key={report.id} style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>{assessmentLabel(report.hazardType)}</Text>
      <Text style={assessmentStyles.body}>{report.description}</Text>
      <Text style={assessmentStyles.helper}>Location: {report.location.coordinates[1]}, {report.location.coordinates[0]}</Text>
      <Text style={assessmentStyles.helper}>Reported Severity: {report.severity} · {report.status}</Text>
      {assessment ? <><Text style={assessmentStyles.label}>Final Risk Level</Text><PriorityBadge priority={assessment.finalRiskLevel} />
        <AssessmentButton label="View Risk Assessment" onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: assessment.id } })} /></>
        : report.status === 'VERIFIED' ? <AssessmentButton label="Assess Risk" onPress={() => router.push({ pathname: '/officer/assessments/create', params: { hazardReportId: report.id } })} /> : null}
    </View>)}
  </DashboardScreen>;
}
