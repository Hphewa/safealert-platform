import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { IncidentMonitoringDetailResponse } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getIncidentMonitoringDetail } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';

export function OfficerMonitoringDetailScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ incidentId?: string | string[]; notice?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [showSavedNotice, setShowSavedNotice] = useState(notice === 'assessment-saved');
  useEffect(() => {
    if (notice !== 'assessment-saved') return;
    setShowSavedNotice(true);
    router.setParams({ notice: undefined });
  }, [notice, router]);
  const load = useCallback(async (): Promise<IncidentMonitoringDetailResponse> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!incidentId) throw new Error('An incident reference is required.');
    return getIncidentMonitoringDetail(incidentId, accessToken);
  }, [accessToken, incidentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const item = data?.monitoring;
  const assessment = item?.currentAssessment ?? item?.latestAssessment;
  const currentActive = item?.currentAssessment?.status === 'ACTIVE' ? item.currentAssessment : null;

  return <DashboardScreen bottomNavItems={officerBottomNavItems}>
    <Text style={assessmentStyles.title}>Incident Monitoring</Text>
    {showSavedNotice ? <Text accessibilityRole="alert" style={assessmentStyles.helper}>
      Risk assessment saved successfully. This incident is now available in Monitoring.
    </Text> : null}
    {!item ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : <>
      <View style={assessmentStyles.card}>
        <Text style={assessmentStyles.label}>INCIDENT · {item.incident.status}</Text>
        <Text style={assessmentStyles.heading}>{assessmentLabel(item.incident.hazardType)}</Text>
        <Text style={assessmentStyles.helper}>Location: {formatIncidentLocation(item.incident.location)}</Text>
        <Text style={assessmentStyles.helper}>Verified reports: {item.totalVerifiedReports}</Text>
        <Text style={assessmentStyles.helper}>{item.newVerifiedReportsSinceAssessment} new verified {item.newVerifiedReportsSinceAssessment === 1 ? 'report' : 'reports'}</Text>
        {item.hasNewVerifiedEvidence ? <Text style={assessmentStyles.label}>NEW VERIFIED EVIDENCE</Text> : null}
        <Text style={assessmentStyles.helper}>Latest verified evidence: {item.latestVerifiedReportAt ? formatIncidentTime(item.latestVerifiedReportAt) : 'Time unavailable'}</Text>
      </View>
      <View style={assessmentStyles.card}>
        {assessment ? <>
          <Text style={assessmentStyles.label}>{currentActive ? 'CURRENT ASSESSMENT' : 'LATEST ASSESSMENT'}</Text>
          <PriorityBadge priority={assessment.finalRiskLevel} />
          <Text style={assessmentStyles.body}>Status: {assessment.status}</Text>
          <Text style={assessmentStyles.helper}>Score: {assessment.calculatedScore}</Text>
          <Text style={assessmentStyles.helper}>Assessed: {formatIncidentTime(assessment.assessedAt)}</Text>
          {assessment.closureReason ? <Text style={assessmentStyles.helper}>Closure reason: {assessment.closureReason}</Text> : null}
        </> : <Text style={assessmentStyles.body}>No active risk assessment</Text>}
      </View>
      <Text style={assessmentStyles.heading}>Recent verified reports</Text>
      {data.recentVerifiedReports.length === 0 ? <Text style={assessmentStyles.helper}>No verified reports are available.</Text> : data.recentVerifiedReports.map((report) => <View key={report.id} style={assessmentStyles.card}>
        <Text style={assessmentStyles.body}>{report.description}</Text>
        <Text style={assessmentStyles.helper}>Severity: {report.severity}</Text>
        <Text style={assessmentStyles.helper}>Verified: {report.verifiedAt ? formatIncidentTime(report.verifiedAt) : 'Time unavailable'}</Text>
      </View>)}
      {currentActive ? <>
        <AssessmentButton label="VIEW ASSESSMENT" onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: currentActive.id } })} />
        <AssessmentButton label="REASSESS RISK" onPress={() => router.push({ pathname: '/officer/assessments/create', params: { assessmentId: currentActive.id } })} />
        <AssessmentButton label="CLOSE ASSESSMENT" onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: currentActive.id } })} />
      </> : assessment ? <AssessmentButton label="VIEW HISTORY" onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: assessment.id } })} /> : null}
      <AssessmentButton label="Refresh monitoring" secondary disabled={loading} onPress={() => void reload()} />
      {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
    </>}
  </DashboardScreen>;
}
