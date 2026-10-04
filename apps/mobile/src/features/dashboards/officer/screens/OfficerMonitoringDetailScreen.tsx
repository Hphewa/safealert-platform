import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning, type IncidentActivityTimelineResponse, type IncidentMonitoringDetailResponse,
  type RiskAssessmentHistoryResponse, type SafeRiskAssessment } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getIncidentMonitoringDetail } from '../api/incidentApi';
import { getRiskAssessmentHistory } from '../api/riskAssessmentApi';
import { getIncidentActivityTimeline } from '../api/incidentActivityApi';
import { IncidentActivityTimeline } from '../components/IncidentActivityTimeline';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentTime } from '../incidentGrouping';
import { dashboardTheme } from '../../shared/theme';

export function OfficerMonitoringDetailScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ incidentId?: string | string[]; notice?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [successNotice, setSuccessNotice] = useState<'assessment-saved' | 'assessment-updated' | null>(
    notice === 'assessment-saved' || notice === 'assessment-updated' ? notice : null
  );
  const [history, setHistory] = useState<RiskAssessmentHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activity, setActivity] = useState<IncidentActivityTimelineResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingEvidence, setReviewingEvidence] = useState(false);
  const historyGeneration = useRef(0);
  const activityGeneration = useRef(0);

  const load = useCallback(async (): Promise<IncidentMonitoringDetailResponse> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!incidentId) throw new Error('An incident reference is required.');
    return getIncidentMonitoringDetail(incidentId, accessToken);
  }, [accessToken, incidentId]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const item = data && data.monitoring.incident.id === incidentId ? data.monitoring : null;
  const recentReports = data && data.monitoring.incident.id === incidentId ? data.recentVerifiedReports : [];
  const visibleAssessment = item?.currentAssessment ?? item?.latestAssessment;
  const currentActive = item?.currentAssessment?.status === 'ACTIVE' ? item.currentAssessment : null;
  const latestAssessment = item?.latestAssessment ?? null;

  const loadHistory = useCallback(async () => {
    if (!accessToken || !incidentId) return;
    const request = ++historyGeneration.current;
    setHistoryLoading(true); setHistoryError(null);
    try {
      const result = await getRiskAssessmentHistory(incidentId, accessToken);
      if (request === historyGeneration.current) setHistory(result);
    } catch {
      if (request === historyGeneration.current) setHistoryError('Assessment history is unavailable. Try again.');
    } finally {
      if (request === historyGeneration.current) setHistoryLoading(false);
    }
  }, [accessToken, incidentId]);

  const loadActivity = useCallback(async () => {
    if (!accessToken || !incidentId) return;
    const request = ++activityGeneration.current;
    setActivityLoading(true); setActivityError(null);
    try {
      const result = await getIncidentActivityTimeline(incidentId, accessToken);
      if (request === activityGeneration.current) setActivity(result.incidentId === incidentId ? result : null);
    } catch {
      if (request === activityGeneration.current) setActivityError('Incident activity is unavailable. Try again.');
    } finally {
      if (request === activityGeneration.current) setActivityLoading(false);
    }
  }, [accessToken, incidentId]);

  useEffect(() => {
    if (notice !== 'assessment-saved' && notice !== 'assessment-updated') return;
    setSuccessNotice(notice);
    router.setParams({ notice: undefined });
    const timer = setTimeout(() => setSuccessNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice, router]);
  useEffect(() => {
    setHistory(null); setActivity(null); setReviewingEvidence(false);
    void loadHistory();
    void loadActivity();
    return () => { historyGeneration.current += 1; activityGeneration.current += 1; };
  }, [loadHistory, loadActivity]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([reload(), loadHistory(), loadActivity()]); }
    finally { setRefreshing(false); }
  };

  const warnings = visibleAssessment ? (item?.warnings ?? []).filter((warning) => warning.assessmentId === visibleAssessment.id) : [];
  const currentWarnings = currentActive ? (item?.warnings ?? []).filter((warning) => warning.assessmentId === currentActive.id) : [];
  const shouldRecommendWarning = Boolean(currentActive && canCreateWarning(currentActive.finalRiskLevel) && currentWarnings.length === 0);
  const orderedHistory = [...(history && history.incidentId === incidentId ? history.assessments : [])]
    .sort((a, b) => Date.parse(b.assessedAt) - Date.parse(a.assessedAt));

  return <DashboardScreen bottomNavItems={officerBottomNavItems}
    refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} tintColor={dashboardTheme.colors.primary} />}>
    <Text style={assessmentStyles.title}>Incident Monitoring</Text>
    {successNotice ? <Text accessibilityRole="alert" style={styles.savedNotice}>{successNotice === 'assessment-updated' ? 'Assessment updated' : 'Assessment saved'}</Text> : null}
    {!item ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : <>
      <View style={styles.header}>
        <Text style={assessmentStyles.heading}>{assessmentLabel(item.incident.hazardType)} Incident</Text>
        <StatusBadge label={item.incident.status} tone={item.incident.status === 'ACTIVE' ? 'info' : 'neutral'} />
        <HumanReadableLocation location={item.incident.location} style={styles.location} />
      </View>

      {currentActive ? <View style={styles.riskCard}>
        <Text style={assessmentStyles.label}>CURRENT RISK</Text>
        <PriorityBadge priority={currentActive.finalRiskLevel} />
        <Text style={styles.score}>Risk score {currentActive.calculatedScore}</Text>
        <Text style={assessmentStyles.helper}>Assessed {formatIncidentTime(currentActive.assessedAt)}</Text>
        <AssessmentButton label="VIEW ASSESSMENT" secondary onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: currentActive.id } })} />
      </View> : latestAssessment ? <View style={styles.riskCard}>
        <Text style={assessmentStyles.label}>LATEST ASSESSMENT</Text>
        <PriorityBadge priority={latestAssessment.finalRiskLevel} />
        <Text style={assessmentStyles.body}>Status: {latestAssessment.status}</Text>
        <Text style={assessmentStyles.helper}>Score: {latestAssessment.calculatedScore}</Text>
        <Text style={assessmentStyles.helper}>Assessed {formatIncidentTime(latestAssessment.assessedAt)}</Text>
      </View> : <View style={styles.riskCard}><Text style={assessmentStyles.body}>No current risk assessment</Text></View>}

      {currentActive && item.hasNewVerifiedEvidence && item.newVerifiedReportsSinceAssessment > 0 ? <View style={styles.evidenceBanner}>
        <Text style={styles.evidenceTitle}>NEW VERIFIED EVIDENCE</Text>
        <Text style={assessmentStyles.body}>{item.newVerifiedReportsSinceAssessment} verified {item.newVerifiedReportsSinceAssessment === 1 ? 'report was' : 'reports were'} added after the current assessment.</Text>
        <Text style={assessmentStyles.helper}>New information may affect the current risk decision.</Text>
        <AssessmentButton label={reviewingEvidence ? 'EVIDENCE REVIEWED' : 'REVIEW EVIDENCE'} secondary onPress={() => setReviewingEvidence(true)} />
      </View> : currentActive && item.newVerifiedReportsSinceAssessment === 0 ? <Text style={assessmentStyles.helper}>No new verified evidence since assessment</Text> : null}

      <View style={styles.summary}>
        <Text style={assessmentStyles.heading}>Situation Summary</Text>
        <AssessmentDetail label="Verified Reports" value={item.totalVerifiedReports} />
        <AssessmentDetail label="Latest Evidence" value={item.latestVerifiedReportAt ? formatIncidentTime(item.latestVerifiedReportAt) : 'Time unavailable'} />
        <AssessmentDetail label="Warning" value={warnings.length ? warnings.map((warning) => warning.status === 'PUBLISHED' ? 'Published' : 'Draft').join(', ') : 'None'} />
      </View>

      <IncidentActivityTimeline events={activity && activity.incidentId === incidentId ? activity.events : []}
        loading={activityLoading} error={activityError} onRetry={() => void loadActivity()} />

      <View style={styles.section}>
        <Text style={assessmentStyles.heading}>Recent Verified Reports</Text>
        {recentReports.length === 0 ? <Text style={assessmentStyles.helper}>No verified reports are available.</Text> : recentReports.map((report, index) => <View key={report.id} style={styles.report}>
          <Text numberOfLines={reviewingEvidence ? undefined : 2} style={assessmentStyles.body}>{report.description}</Text>
          <Text style={assessmentStyles.helper}>Reported severity: {report.severity}</Text>
          <Text style={assessmentStyles.helper}>Verified: {report.verifiedAt ? formatIncidentTime(report.verifiedAt) : 'Time unavailable'}</Text>
          {index === recentReports.length - 1 ? null : <View style={styles.separator} />}
        </View>)}
        {reviewingEvidence ? <AssessmentButton label="SHOW LESS EVIDENCE" secondary onPress={() => setReviewingEvidence(false)} /> : null}
      </View>

      <View style={styles.section}>
        <Text style={assessmentStyles.heading}>Warning</Text>
        {warnings.length ? warnings.map((warning, index) => <View key={warning.id} style={styles.warning}>
          <View style={styles.warningHeader}>
            <Text style={assessmentStyles.body}>Warning {index + 1}</Text>
            <StatusBadge label={warning.status} tone={warning.status === 'PUBLISHED' ? 'success' : 'neutral'} />
          </View>
          <AssessmentButton label={warning.status === 'DRAFT' ? `VIEW WARNING ${index + 1}` : `VIEW WARNING ${index + 1}`}
            secondary onPress={() => router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId: warning.id } })} />
        </View>) : shouldRecommendWarning ? <View style={styles.warning}>
          <Text style={assessmentStyles.heading}>Recommended Action</Text>
          <Text style={assessmentStyles.body}>Consider issuing a public warning for this incident.</Text>
          <Text style={assessmentStyles.helper}>Creating a warning saves a draft for review. It does not publish automatically.</Text>
          <AssessmentButton label="CREATE WARNING" onPress={() => router.push({ pathname: '/officer/warnings/create', params: { assessmentId: currentActive!.id } })} />
        </View> : <Text style={assessmentStyles.helper}>No warning has been created.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={assessmentStyles.heading}>Assessment History</Text>
        {historyLoading && !history ? <Text style={assessmentStyles.helper}>Loading assessment history…</Text> : null}
        {historyError ? <><Text accessibilityRole="alert" style={assessmentStyles.error}>{historyError}</Text>
          <AssessmentButton label="Retry assessment history" secondary onPress={() => void loadHistory()} /></> : null}
        {!historyLoading && !historyError && orderedHistory.length === 0 ? <Text style={assessmentStyles.helper}>No assessment history is available.</Text> : null}
        {orderedHistory.map((assessment, index) => <AssessmentHistoryRow key={assessment.id} assessment={assessment}
          label={assessment.id === item.currentAssessment?.id ? 'Current' : index === 0 && !item.currentAssessment ? 'Latest' : 'Previous'}
          onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: assessment.id } })} />)}
      </View>

      {currentActive ? <View style={styles.actions}>
        <AssessmentButton label="REASSESS RISK" onPress={() => router.push({ pathname: '/officer/assessments/reassess/[step]', params: { assessmentId: currentActive.id, step: 'reason' } })} />
        <AssessmentButton label="Close Assessment" secondary onPress={() => router.push({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId: currentActive.id } })} />
      </View> : null}
      {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
    </>}
  </DashboardScreen>;
}

function AssessmentHistoryRow({ assessment, label, onPress }: {
  assessment: SafeRiskAssessment; label: string; onPress: () => void;
}) {
  return <View style={styles.historyRow}>
    <View style={styles.historyTitle}>
      <Text style={assessmentStyles.label}>{label}</Text>
      <PriorityBadge priority={assessment.finalRiskLevel} />
    </View>
    <Text style={assessmentStyles.helper}>{formatIncidentTime(assessment.assessedAt)}</Text>
    <AssessmentButton label={`View ${label.toLowerCase()} assessment`} secondary onPress={onPress} />
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: 9 },
  location: { color: dashboardTheme.colors.text, fontSize: 15, lineHeight: 21 },
  riskCard: { gap: 8, padding: 16, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  score: { fontSize: 17, fontWeight: '700', color: dashboardTheme.colors.muted },
  evidenceBanner: { gap: 8, padding: 16, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.high, backgroundColor: dashboardTheme.colors.highSoft },
  evidenceTitle: { color: dashboardTheme.colors.high, fontWeight: '800', letterSpacing: 0.5 },
  summary: { gap: 10, padding: 16, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  section: { gap: 10 },
  report: { gap: 5, paddingVertical: 10 },
  separator: { height: 1, marginTop: 8, backgroundColor: dashboardTheme.colors.border },
  warning: { gap: 10, padding: 14, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  warningHeader: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  historyRow: { gap: 7, padding: 14, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface },
  historyTitle: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: 10 },
  savedNotice: { padding: 12, borderRadius: 12, color: dashboardTheme.colors.success, backgroundColor: dashboardTheme.colors.successSoft, fontWeight: '700' }
});
