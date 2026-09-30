import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canCreateWarning, type GetPendingOfficerReportsResponse, type IncidentMonitoringSummary, type IncidentWithReportsResponse } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { StatCard } from '../../shared/components/StatCard';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { listInitialAssessmentQueue, listIncidentMonitoring } from '../api/incidentApi';
import { listPendingOfficerReports } from '../api/officerReportsApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { officerBottomNavItems, officerQuickActions } from '../officerNavigation';
import { mapSafeReportToOfficerGroupedReportSummary } from '../reports';
import { warningStatusCounts, type WarningCardStatus } from '../warningList';

type OfficerDashboardData = {
  pendingReports: GetPendingOfficerReportsResponse;
  assessmentQueue: IncidentWithReportsResponse[];
  monitoring: IncidentMonitoringSummary[];
};

const dashboardQuickActions = [
  ...officerQuickActions,
  {
    title: 'Warnings',
    subtitle: 'Review warning status and history',
    href: '/officer/warnings' as const,
    icon: 'warning-outline'
  }
];

function riskRank(risk: string | undefined) {
  if (risk === 'CRITICAL') return 4;
  if (risk === 'HIGH') return 3;
  if (risk === 'MODERATE') return 2;
  if (risk === 'LOW') return 1;
  return 0;
}

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
      .slice(0, 3)
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
  const highestRisk = useMemo(() => {
    const risks = data?.monitoring
      .map((item) => item.currentAssessment?.finalRiskLevel ?? item.latestAssessment?.finalRiskLevel)
      .filter((risk) => Boolean(risk)) ?? [];
    return risks.sort((a, b) => riskRank(b) - riskRank(a))[0] ?? 'None';
  }, [data]);

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
      <DashboardHeader title="Officer Dashboard" trailingIcon="person-circle-outline" onTrailingPress={() => router.push('/officer/profile')} />
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh officer dashboard" disabled={loading} onPress={() => void reload()} style={styles.refreshButton}>
        {loading ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="refresh-outline" size={18} />}
        <Text style={styles.refreshLabel}>{loading ? 'Refreshing dashboard...' : 'Refresh dashboard'}</Text>
      </Pressable>

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
          <View style={styles.statGrid}>
            <StatCard label="Pending Reports" value={data.pendingReports.reports.length} icon="document-text-outline" tone="info" />
            <StatCard label="Risk Assessments" value={data.assessmentQueue.length} icon="shield-checkmark-outline" tone="high" />
            <StatCard label="New Verified Evidence" value={newEvidenceCount} icon="alert-circle-outline" tone={newEvidenceCount ? 'critical' : 'success'} />
            <StatCard label="Draft Warnings" value={warningCounts.draft} icon="create-outline" tone="neutral" />
            <StatCard label="Published Warnings" value={warningCounts.published} icon="warning-outline" tone="success" />
          </View>

          <DashboardSection actionHref="/officer/reports" actionLabel="View All" title="Latest Pending Reports">
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

          <DashboardSection actionHref="/officer/monitoring" actionLabel="Open Monitoring" title="Active Monitoring">
            <View style={styles.monitoringCard}>
              <View style={styles.monitoringStats}>
                <View style={styles.monitoringStat}><Text style={styles.monitoringValue}>{data.monitoring.length}</Text><Text style={styles.monitoringLabel}>Active incidents</Text></View>
                <View style={styles.monitoringStat}><Text style={styles.monitoringValue}>{newEvidenceCount}</Text><Text style={styles.monitoringLabel}>New verified reports</Text></View>
                <View style={styles.monitoringStat}><Text style={styles.monitoringValue}>{highestRisk}</Text><Text style={styles.monitoringLabel}>Highest current risk</Text></View>
              </View>
              <Text style={styles.message}>Track assessed incidents and newly verified evidence from the Monitoring workspace.</Text>
            </View>
          </DashboardSection>

          <DashboardSection title="Quick Actions">
            <View style={styles.actionGrid}>
              {dashboardQuickActions.map((action, index) => (
                <ActionCard
                  href={action.href}
                  icon={action.icon}
                  key={`${action.title}-${index}`}
                  subtitle={action.subtitle}
                  title={action.title}
                  variant={index === 0 ? 'primary' : 'default'}
                />
              ))}
            </View>
          </DashboardSection>
        </>
      ) : null}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 24
  },
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
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  monitoringCard: {
    gap: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  monitoringStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  monitoringStat: {
    flex: 1,
    minWidth: 120,
    gap: 3
  },
  monitoringValue: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  monitoringLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  list: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  pressed: {
    opacity: 0.8
  }
});
