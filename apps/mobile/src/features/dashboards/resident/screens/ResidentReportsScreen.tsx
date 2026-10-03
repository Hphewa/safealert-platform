import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportStatus, SafeReport } from '@safealert/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { listMyReports } from '../api/reportApi';
import { residentBottomNavItems } from '../mockData';
import { listQueuedReports, type OfflineReportQueueItem } from '../offlineReportQueue';
import {
  filterResidentReports,
  formatResidentReportCount,
  formatResidentReportLocation,
  formatResidentReportSubmittedAt,
  hazardImageForResident,
  hazardLabelForResident,
  residentReportTabs,
  severityToneForResident,
  statusDescriptionForResident,
  statusLabelForResident,
  statusToneForResident,
  residentReportStatusHref,
  type ResidentReportFilterKey
} from '../reports';

type ResidentReportsLoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function ResidentReportsScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ResidentReportFilterKey>('all');
  const [reports, setReports] = useState<SafeReport[]>([]);
  const [loadStatus, setLoadStatus] = useState<ResidentReportsLoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queuedReports, setQueuedReports] = useState<OfflineReportQueueItem[]>([]);
  const inFlightRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const reportsRef = useRef<SafeReport[]>([]);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  const loadReports = useCallback(
    async (isRefresh = false) => {
      if (inFlightRef.current) {
        return;
      }

      if (!accessToken) {
        setLoadStatus('error');
        setErrorMessage('Your resident session is unavailable. Please log in again.');
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      inFlightRef.current = true;
      setLoadStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);

      try {
        const response = await listMyReports(accessToken);

        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setReports(response.reports);
        setLoadStatus('success');
      } catch {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setLoadStatus('error');
        setErrorMessage('Your reports could not be loaded.');
      } finally {
        if (latestRequestIdRef.current === requestId) {
          inFlightRef.current = false;
        }
      }
    },
    [accessToken]
  );

  const loadQueuedReports = useCallback(async () => {
    if (!user?.id) {
      setQueuedReports([]);
      return;
    }

    setQueuedReports(await listQueuedReports(user.id));
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadReports(reportsRef.current.length > 0);
      void loadQueuedReports();

      return () => {
        latestRequestIdRef.current += 1;
        inFlightRef.current = false;
      };
    }, [loadQueuedReports, loadReports])
  );

  const filteredReports = filterResidentReports(reports, activeTab);
  const isLoading = loadStatus === 'loading' || loadStatus === 'refreshing';
  const isRefreshing = loadStatus === 'refreshing';
  const showInitialLoading = loadStatus === 'loading' && reports.length === 0;
  const summaryText = errorMessage && reports.length ? errorMessage : formatResidentReportCount(filteredReports.length, activeTab);
  const visibleQueuedReports = activeTab === 'all' || activeTab === 'pending' ? queuedReports : [];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <FlatList
          contentContainerStyle={styles.content}
          data={filteredReports}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            showInitialLoading ? (
              <ResidentReportsStateCard
                icon="refresh-outline"
                loading
                message="Loading your reports..."
                title="Loading My Reports"
              />
            ) : (
              <ResidentReportsEmptyOrErrorState
                activeTab={activeTab}
                errorMessage={errorMessage}
                hasAnyReports={reports.length > 0}
                loadStatus={loadStatus}
                onReportHazard={() => router.push('/resident/report-hazard')}
                onRetry={() => void loadReports(true)}
              />
            )
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.headerRow}>
                <Pressable
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
                </Pressable>

                <Text style={styles.headerTitle}>My Reports</Text>

                <Pressable
                  accessibilityLabel="Refresh my reports"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLoading }}
                  disabled={isLoading}
                  onPress={() => void loadReports(true)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    isLoading && styles.iconButtonDisabled,
                    pressed && !isLoading && styles.pressed
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
                  ) : (
                    <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
                  )}
                </Pressable>
              </View>

              <Text style={styles.description}>
                Track submitted hazard reports and review updates from disaster officers.
              </Text>

              <View style={styles.filterRow}>
                {residentReportTabs.map((tab) => {
                  const isActive = activeTab === tab.key;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={tab.key}
                      onPress={() => setActiveTab(tab.key)}
                      style={[
                        styles.filterChip,
                        isActive ? styles.filterChipActive : styles.filterChipInactive
                      ]}
                    >
                      <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.summaryText, errorMessage && reports.length ? styles.errorText : null]}>
                {summaryText}
              </Text>
              {visibleQueuedReports.map((item) => (
                <OfflineReportCard item={item} key={item.id} />
              ))}
            </View>
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadReports(true)}
              refreshing={isRefreshing}
              tintColor={dashboardTheme.colors.primary}
            />
          }
          renderItem={({ item }) => <ResidentReportCard report={item} />}
          showsVerticalScrollIndicator={false}
        />

        <BottomNavigation items={residentBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

function OfflineReportCard({ item }: { item: OfflineReportQueueItem }) {
  const router = useRouter();
  const hazardLabel = item.draft.hazardType
    ? hazardLabelForResident(item.draft.hazardType, item.draft.otherHazardType)
    : 'Hazard report';

  return (
    <Pressable
      accessibilityLabel={`Open saved offline ${hazardLabel} report for review`}
      accessibilityRole="button"
      onPress={() => {
        router.push({
          pathname: '/resident/review-report',
          params: { operationId: item.operationId, offlineReportId: item.id }
        });
      }}
      style={({ pressed }) => [styles.offlineCard, pressed && styles.pressed]}
    >
      <View style={styles.offlineCardHeader}>
        <Text style={styles.offlineCardTitle}>{hazardLabel}</Text>
        <View style={styles.offlineBadgeRow}>
          <Text style={styles.offlineBadge}>Saved offline</Text>
          <DashboardGlyph color={dashboardTheme.colors.moderate} name="chevron-forward" size={16} />
        </View>
      </View>
      <Text style={styles.offlineCardText}>
        {item.status === 'FAILED'
          ? 'Waiting to retry when connection returns.'
          : 'Tap to review and continue this report.'}
      </Text>
    </Pressable>
  );
}

function ResidentReportCard({ report }: { report: SafeReport }) {
  const router = useRouter();
  const hazardLabel = hazardLabelForResident(report.hazardType);
  const statusLabel = statusLabelForResident(report.status);
  const statusDescription = statusDescriptionForResident(report.status);

  return (
    <Pressable
      accessibilityLabel={`Open ${hazardLabel} report details`}
      accessibilityRole="button"
      onPress={() => {
        router.push(residentReportStatusHref(report.id));
      }}
      style={({ pressed }) => [styles.reportCard, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <StatusBadge label={statusLabel} tone={statusToneForResident(report.status)} />
        <StatusBadge label={`${report.severity} severity`} tone={severityToneForResident(report.severity)} />
      </View>

      <View style={styles.cardMainRow}>
        <View style={styles.reportIconWrap}>
          <Image accessibilityLabel={`${hazardLabel} hazard icon`} source={hazardImageForResident(report.hazardType)} style={styles.reportIconImage} />
        </View>
        <View style={styles.reportBody}>
          <Text style={styles.reportTitle}>{hazardLabel}</Text>
          <Text style={styles.reportStatusText}>{statusDescription}</Text>
          <Text style={styles.reportMeta}>{formatResidentReportSubmittedAt(report.createdAt)}</Text>
          <Text style={styles.reportMeta}>Location: {formatResidentReportLocation(report)}</Text>
          {report.mediaReference || report.voiceEvidence ? (
            <View style={styles.evidenceRow}>
              {report.mediaReference ? <Text style={styles.evidenceText}>Photo evidence</Text> : null}
              {report.voiceEvidence ? <Text style={styles.evidenceText}>Voice note</Text> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.openHint}>
          <Text style={styles.openHintText}>Open</Text>
          <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={18} />
        </View>
      </View>
    </Pressable>
  );
}

type ResidentReportsEmptyOrErrorStateProps = {
  activeTab: ResidentReportFilterKey;
  errorMessage: string | null;
  hasAnyReports: boolean;
  loadStatus: ResidentReportsLoadStatus;
  onReportHazard: () => void;
  onRetry: () => void;
};

function ResidentReportsEmptyOrErrorState({
  activeTab,
  errorMessage,
  hasAnyReports,
  loadStatus,
  onReportHazard,
  onRetry
}: ResidentReportsEmptyOrErrorStateProps) {
  if (loadStatus === 'error' && errorMessage) {
    return (
      <ResidentReportsStateCard
        actionLabel="Try Again"
        icon="alert-circle-outline"
        message={errorMessage}
        onActionPress={onRetry}
        title="Unable to load reports"
      />
    );
  }

  if (hasAnyReports) {
    return (
      <ResidentReportsStateCard
        icon={emptyIconForFilter(activeTab)}
        message="No reports match this filter."
        title={`No ${filterLabelForState(activeTab)} Reports`}
      />
    );
  }

  return (
    <ResidentReportsStateCard
      actionLabel="Report Hazard"
      icon="document-text-outline"
      message="You haven't submitted any hazard reports yet."
      onActionPress={onReportHazard}
      title="No hazard reports yet"
    />
  );
}

function filterLabelForState(filter: ResidentReportFilterKey) {
  switch (filter) {
    case 'all':
      return 'Submitted';
    case 'pending':
      return 'Pending';
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
  }
}

function emptyIconForFilter(filter: ResidentReportFilterKey) {
  const statusIconByFilter: Partial<Record<ResidentReportFilterKey, Exclude<ReportStatus, 'RESOLVED'>>> = {
    pending: 'PENDING',
    verified: 'VERIFIED',
    rejected: 'REJECTED',
    cancelled: 'CANCELLED'
  };
  const status = statusIconByFilter[filter];

  if (!status) {
    return 'document-text-outline';
  }

  switch (status) {
    case 'PENDING':
      return 'time-outline';
    case 'VERIFIED':
      return 'checkmark-circle-outline';
    case 'REJECTED':
      return 'close-circle-outline';
    case 'CANCELLED':
      return 'remove-circle-outline';
  }
}

type ResidentReportsStateCardProps = {
  title: string;
  message: string;
  icon: string;
  actionLabel?: string;
  onActionPress?: () => void;
  loading?: boolean;
};

function ResidentReportsStateCard({
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
  loading = false
}: ResidentReportsStateCardProps) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        {loading ? (
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
        ) : (
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={icon} size={22} />
        )}
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={({ pressed }) => [styles.stateActionButton, pressed && styles.pressed]}
        >
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  contentWrap: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20
  },
  headerBlock: {
    gap: 14,
    marginBottom: 6
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surface
  },
  iconButtonDisabled: {
    opacity: 0.55
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  filterChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999
  },
  filterChipActive: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  filterChipInactive: {
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surface
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  filterLabelActive: {
    color: dashboardTheme.colors.primaryStrong
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  offlineCard: {
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.moderate,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.moderateSoft
  },
  offlineCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  offlineCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  offlineBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.moderate
  },
  offlineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  offlineCardText: {
    fontSize: 13,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  errorText: {
    color: dashboardTheme.colors.critical
  },
  reportCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  reportIconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  reportIconImage: {
    width: 46,
    height: 46,
    resizeMode: 'contain'
  },
  reportBody: {
    flex: 1,
    gap: 4
  },
  reportTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  reportStatusText: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  reportMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  evidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  evidenceText: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  openHint: {
    alignItems: 'center',
    gap: 2
  },
  openHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  stateCard: {
    gap: 12,
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  stateIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  stateMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  stateActionButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  stateActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
