import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardSection } from '../../shared/components/DashboardSection';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { StatCard } from '../../shared/components/StatCard';
import { dashboardTheme } from '../../shared/theme';
import { listPendingOfficerReports } from '../api/officerReportsApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { officerBottomNavItems, officerQuickActions } from '../officerNavigation';
import { mapSafeReportToOfficerGroupedReportSummary } from '../reports';

export function OfficerDashboardScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const loadReports = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return listPendingOfficerReports(accessToken);
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(loadReports);
  const latestReports = data
    ? [...data.reports]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 3)
        .map((report) => mapSafeReportToOfficerGroupedReportSummary(report))
    : [];

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems}>
      <DashboardHeader showLogoutButton title="Dashboard" trailingIcon="person-circle-outline" onTrailingPress={() => router.push('/officer/profile')} />

      {!loading && !error && data ? (
        <View style={styles.grid}>
          <StatCard label="Pending Reports" value={data.reports.length} icon="document-text-outline" tone="info" />
        </View>
      ) : null}

      <DashboardSection actionHref="/officer/reports" actionLabel="View All" title="Latest Pending Reports">
        <View style={styles.list}>
          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={dashboardTheme.colors.primary} />
              <Text style={styles.message}>Loading pending reports...</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry reports" onPress={() => void reload()} style={styles.refreshButton}>
                <Text style={styles.refreshLabel}>Retry</Text>
              </Pressable>
            </View>
          ) : data ? (
            <>
              {latestReports.length === 0 ? (
                <Text style={styles.message}>No pending reports. New resident reports will appear here.</Text>
              ) : latestReports.map((report) => (
                <ReportListItem
                  href={report.href}
                  icon={report.icon}
                  key={report.id}
                  subtitle={report.locationLabel}
                  timeLabel={report.latestUpdateLabel}
                  title={report.hazardLabel}
                  detailItems={[report.descriptionPreview]}
                />
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh reports" onPress={() => void reload()} style={styles.refreshButton}>
                <Text style={styles.refreshLabel}>Refresh reports</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </DashboardSection>

      <DashboardSection title="Quick Actions">
        <View style={styles.grid}>
          {officerQuickActions.map((action, index) => (
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
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  state: {
    gap: 12,
    paddingVertical: 16
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  list: {
    gap: 12
  }
});
