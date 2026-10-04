import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { canCreateWarning, type GetPendingOfficerReportsResponse, type IncidentMonitoringSummary, type IncidentWithReportsResponse } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { listInitialAssessmentQueue, listIncidentMonitoring } from '../api/incidentApi';
import { listPendingOfficerReports } from '../api/officerReportsApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { officerBottomNavItems } from '../officerNavigation';
import { mapSafeReportToOfficerGroupedReportSummary } from '../reports';
import { warningStatusCounts, type WarningCardStatus } from '../warningList';

type OfficerDashboardData = {
  pendingReports: GetPendingOfficerReportsResponse;
  assessmentQueue: IncidentWithReportsResponse[];
  monitoring: IncidentMonitoringSummary[];
};

export function OfficerDashboardScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const loadDashboard = useCallback(async (): Promise<OfficerDashboardData> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    const [pendingReports, assessmentQueue, monitoring] = await Promise.all([
      listPendingOfficerReports(accessToken),
      listInitialAssessmentQueue(accessToken),
      listIncidentMonitoring(accessToken)
    ]);
    return {
      pendingReports,
      assessmentQueue: assessmentQueue.incidents,
      monitoring: monitoring.incidents
    };
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(loadDashboard);

  const latestReports = useMemo(() => {
    if (!data) return [];
    return [...data.pendingReports.reports]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 2)
      .map((report) => mapSafeReportToOfficerGroupedReportSummary(report));
  }, [data]);

  const warningRows = useMemo(() => {
    if (!data) return [];
    return data.monitoring.flatMap((item) => {
      const assessment = item.currentAssessment;
      if (!assessment || !canCreateWarning(assessment.finalRiskLevel)) return [];
      const warning = item.warnings.find((candidate) => candidate.assessmentId === assessment.id);
      const status: WarningCardStatus = warning?.status ?? 'NEEDS WARNING';
      return [{ status }];
    });
  }, [data]);
  const warningCounts = useMemo(() => warningStatusCounts(warningRows), [warningRows]);

  const newEvidenceCount = useMemo(
    () => data?.monitoring.reduce((total, item) => total + item.newVerifiedReportsSinceAssessment, 0) ?? 0,
    [data]
  );
  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <DashboardHeader roleLabel="INCIDENT COMMAND" accentColor={dashboardTheme.colors.critical} title="Officer Dashboard" subtitle="Prioritize what needs your attention" trailingIcon="person-circle-outline" trailingProfile trailingAccessibilityLabel="Open officer profile" onTrailingPress={() => router.push('/officer/profile')} />
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh officer dashboard" disabled={loading} onPress={() => void reload()} style={[styles.refreshButton, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="refresh-outline" size={18} />}
          <Text style={styles.refreshLabel}>{loading ? 'Refreshing...' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={dashboardTheme.colors.primary} />
          <Text style={styles.message}>Loading officer activity...</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry officer dashboard" onPress={() => void reload()} style={styles.retryButton}>
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : data ? (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}><View><Text style={styles.summaryEyebrow}>NEEDS ATTENTION</Text><Text style={styles.summaryTitle}>Today’s operational queue</Text></View><DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="chevron-forward" size={18} /></View>
            <View style={styles.statGrid}>
              <SummaryTile href="/officer/reports" label="Pending reports" value={data.pendingReports.reports.length} icon="document-text-outline" tone="info" />
              <SummaryTile href="/officer/assessments" label="Assessments" value={data.assessmentQueue.length} icon="shield-checkmark-outline" tone="high" />
              <SummaryTile href="/officer/monitoring" label="New evidence" value={newEvidenceCount} icon="alert-circle-outline" tone={newEvidenceCount ? 'critical' : 'success'} />
              <SummaryTile href="/officer/warnings" label="Warnings needed" value={warningCounts.needsWarning} icon="warning-outline" tone={warningCounts.needsWarning ? 'critical' : 'success'} />
            </View>
          </View>

          <DashboardSection actionHref="/officer/reports" actionLabel="View all" title="Start with these reports">
            <View style={styles.list}>
              {latestReports.length === 0 ? (
                <Text style={styles.message}>No pending reports. New resident reports will appear here.</Text>
              ) : latestReports.map((report) => (
                <ReportListItem
                  href={report.href}
                  icon={report.icon}
                  key={report.id}
                  statusLabel={report.statusLabel}
                  statusTone={report.tone}
                  subtitle={report.locationLabel}
                  timeLabel={report.latestUpdateLabel}
                  title={report.hazardLabel}
                  detailItems={[report.descriptionPreview]}
                />
              ))}
            </View>
          </DashboardSection>

          <View style={styles.monitoringCard}>
            <View style={styles.monitoringHeader}>
              <View style={styles.monitoringTitleBlock}>
                <Text style={styles.monitoringEyebrow}>ACTIVE MONITORING</Text>
                <Text style={styles.monitoringSubtext}>Watch live incidents and new verified evidence.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Monitoring"
                onPress={() => router.push('/officer/monitoring')}
                style={({ pressed }) => [styles.monitoringAction, pressed && styles.pressed]}
              >
                <Text style={styles.monitoringActionText}>Open Monitoring</Text>
                <Text style={styles.monitoringChevron}>&gt;</Text>
              </Pressable>
            </View>
            <View style={styles.monitoringInner}>
              <View style={styles.monitoringStats}>
                <View style={styles.monitoringStat}>
                  <Text style={styles.monitoringValue}>{data.monitoring.length}</Text>
                  <Text style={styles.monitoringLabel}>Active incidents</Text>
                </View>
                <View style={styles.monitoringStat}>
                  <Text style={styles.monitoringValue}>{newEvidenceCount}</Text>
                  <Text style={styles.monitoringLabel}>New verified reports</Text>
                </View>
                <View style={styles.monitoringStat}>
                  <Text style={styles.monitoringValue}>{warningCounts.needsWarning}</Text>
                  <Text style={styles.monitoringLabel}>Warnings needed</Text>
                </View>
              </View>
              <Text style={styles.monitoringDescription}>High and critical risks may require a public warning.</Text>
            </View>
          </View>

        </>
      ) : null}
    </DashboardScreen>
  );
}

function SummaryTile({ href, label, value, icon, tone }: { href: Href; label: string; value: number; icon: string; tone: 'info' | 'high' | 'critical' | 'success' }) {
  const router = useRouter();
  const colors = {
    info: [dashboardTheme.colors.infoSoft, dashboardTheme.colors.info],
    high: [dashboardTheme.colors.highSoft, dashboardTheme.colors.high],
    critical: [dashboardTheme.colors.criticalSoft, dashboardTheme.colors.critical],
    success: [dashboardTheme.colors.successSoft, dashboardTheme.colors.success]
  }[tone];
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${label}`} onPress={() => router.push(href)} style={({ pressed }) => [styles.summaryTile, pressed && styles.pressed]}>
    <View style={[styles.summaryIcon, { backgroundColor: colors[0] }]}><DashboardGlyph color={colors[1]} name={icon} size={16} /></View>
    <View style={styles.summaryTileCopy}><Text style={styles.summaryValue}>{value}</Text><Text numberOfLines={1} style={styles.summaryLabel}>{label}</Text></View>
    <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={16} />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 20
  },
  hero: { gap: 10 },
  state: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  message: {
    color: dashboardTheme.colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  error: {
    color: dashboardTheme.colors.critical,
    fontSize: 15,
    lineHeight: 22
  },
  refreshButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primarySoft,
    backgroundColor: dashboardTheme.colors.primarySoft,
    ...cardShadow
  },
  refreshLabel: {
    color: dashboardTheme.colors.primaryStrong,
    fontWeight: '700'
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  retryLabel: {
    fontWeight: '700',
    color: '#ffffff'
  },
  summaryCard: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryHint: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  summaryEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: dashboardTheme.colors.critical },
  summaryTitle: { marginTop: 3, fontSize: 17, fontWeight: '800', color: dashboardTheme.colors.text },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  summaryTile: {
    flex: 1,
    minWidth: 145,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 15,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  summaryIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  summaryTileCopy: { flex: 1, gap: 1 },
  summaryValue: { fontSize: 21, fontWeight: '900', color: dashboardTheme.colors.text },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: dashboardTheme.colors.muted },
  monitoringCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primarySoft,
    borderRadius: 20,
    backgroundColor: '#f1f6ff',
    ...cardShadow
  },
  monitoringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  monitoringEyebrow: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.text
  },
  monitoringTitleBlock: { flex: 1, gap: 3 },
  monitoringSubtext: { fontSize: 12, lineHeight: 17, color: dashboardTheme.colors.muted },
  monitoringAction: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.surface
  },
  monitoringActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  monitoringChevron: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  monitoringInner: {
    gap: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primarySoft,
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.surface
  },
  monitoringStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  monitoringStat: {
    flex: 1,
    minWidth: 100,
    gap: 5,
    padding: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    ...cardShadow
  },
  monitoringValue: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  monitoringLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: dashboardTheme.colors.text
  },
  monitoringDescription: {
    paddingHorizontal: 2,
    fontSize: 13,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  list: {
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    ...cardShadow
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.8
  }
});
