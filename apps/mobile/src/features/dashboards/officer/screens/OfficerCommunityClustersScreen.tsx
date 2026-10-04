import { useCallback, useMemo, useRef, useState } from 'react';
import type { HazardType, SafeCommunityReportClusterSummary } from '@safealert/contracts';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { goBackSafely } from '@/features/navigation/safeBack';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { listOfficerCommunityReportClusterHistory, listOfficerCommunityReportClusters } from '../api/communityReportClusterApi';
import { hazardImageForResident } from '../../resident/reports';

type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';
type ViewMode = 'pending' | 'history';
type StatusFilter = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESOLVED' | 'CANCELLED';

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'ALL' }, { label: 'Pending', value: 'PENDING' },
  { label: 'Verified', value: 'VERIFIED' }, { label: 'Rejected', value: 'REJECTED' },
  { label: 'Resolved', value: 'RESOLVED' }, { label: 'Cancelled', value: 'CANCELLED' }
];
const hazardFilters: Array<{ label: string; value: HazardType | 'ALL' }> = [
  { label: 'All hazards', value: 'ALL' }, { label: 'Flood', value: 'FLOOD' },
  { label: 'Blocked road', value: 'BLOCKED_ROAD' }, { label: 'Landslide', value: 'LANDSLIDE' },
  { label: 'Other', value: 'OTHER' }
];

export function OfficerCommunityClustersScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [clusters, setClusters] = useState<SafeCommunityReportClusterSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('pending');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [hazardFilter, setHazardFilter] = useState<HazardType | 'ALL'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const latestRequestIdRef = useRef(0);

  const loadClusters = useCallback(async (isRefresh = false, mode: ViewMode = viewMode) => {
    if (inFlightRef.current) return;
    if (!accessToken) {
      setLoadStatus('error');
      setErrorMessage('Your Officer session is unavailable. Please log in again.');
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    inFlightRef.current = true;
    setLoadStatus(isRefresh ? 'refreshing' : 'loading');
    setErrorMessage(null);

    try {
      const response = mode === 'history'
        ? await listOfficerCommunityReportClusterHistory(accessToken)
        : await listOfficerCommunityReportClusters(accessToken);
      if (latestRequestIdRef.current !== requestId) return;
      setClusters(response.clusters);
      setLoadStatus('success');
    } catch (error) {
      if (latestRequestIdRef.current !== requestId) return;
      setLoadStatus('error');
      setErrorMessage(error instanceof ApiClientError || error instanceof Error
        ? error.message
        : 'Community incidents could not be loaded.');
    } finally {
      if (latestRequestIdRef.current === requestId) inFlightRef.current = false;
    }
  }, [accessToken, viewMode]);

  useFocusEffect(useCallback(() => {
    void loadClusters();
    return () => {
      latestRequestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [loadClusters]));

  const isLoading = loadStatus === 'idle' || loadStatus === 'loading';
  const isRefreshing = loadStatus === 'refreshing';
  const visibleClusters = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return clusters.filter((cluster) => {
      if (hazardFilter !== 'ALL' && cluster.hazardType !== hazardFilter) return false;
      if (statusFilter !== 'ALL') {
        const count = statusCount(cluster, statusFilter);
        if (count === 0) return false;
      }
      return !query || cluster.hazardType.replace(/_/g, ' ').toLowerCase().includes(query);
    });
  }, [clusters, hazardFilter, searchText, statusFilter]);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visibleClusters}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                onPress={() => goBackSafely(router, '/officer')}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
              </Pressable>
              <Text style={styles.headerTitle}>Community Incidents</Text>
              <Pressable
                accessibilityLabel="Refresh community incidents"
                accessibilityRole="button"
                disabled={loadStatus === 'loading' || loadStatus === 'refreshing'}
                onPress={() => void loadClusters(true)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                {loadStatus === 'loading' || loadStatus === 'refreshing' ? (
                  <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
                ) : (
                  <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
                )}
              </Pressable>
            </View>
            <Text style={styles.description}>{viewMode === 'pending' ? 'Review related pending reports that may describe the same hazard.' : 'Browse the full community-incident history and review every report status.'}</Text>
            <View style={styles.modeRow}>
              {(['pending', 'history'] as const).map((mode) => <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: viewMode === mode }} onPress={() => { setViewMode(mode); setStatusFilter(mode === 'pending' ? 'PENDING' : 'ALL'); void loadClusters(true, mode); }} style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}><Text style={[styles.modeText, viewMode === mode && styles.modeTextActive]}>{mode === 'pending' ? 'Needs review' : 'History'}</Text></Pressable>)}
            </View>
            <View style={styles.searchCard}><DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="search-outline" size={17} /><TextInput accessibilityLabel="Search community incidents" onChangeText={setSearchText} placeholder="Search by hazard type" placeholderTextColor={dashboardTheme.colors.muted} style={styles.searchInput} value={searchText} /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} accessibilityLabel="Filter community incident status">
              {statusFilters.map((filter) => <Pressable key={filter.value} accessibilityRole="radio" accessibilityState={{ checked: statusFilter === filter.value }} onPress={() => setStatusFilter(filter.value)} style={[styles.filterChip, statusFilter === filter.value && styles.filterChipActive]}><Text style={[styles.filterText, statusFilter === filter.value && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} accessibilityLabel="Filter community incident hazard">
              {hazardFilters.map((filter) => <Pressable key={filter.value} accessibilityRole="radio" accessibilityState={{ checked: hazardFilter === filter.value }} onPress={() => setHazardFilter(filter.value)} style={[styles.filterChip, hazardFilter === filter.value && styles.filterChipActive]}><Text style={[styles.filterText, hazardFilter === filter.value && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}
            </ScrollView>
            {loadStatus === 'success' ? <Text style={styles.resultSummary}>{visibleClusters.length} incident{visibleClusters.length === 1 ? '' : 's'} shown</Text> : null}
            {errorMessage && clusters.length ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
            <ClusterListState
            errorMessage={errorMessage}
            isLoading={isLoading}
            onRetry={() => void loadClusters(true)}
              emptyLabel={viewMode === 'pending' ? 'No community incident groups are waiting for review.' : 'No community incident history is available yet.'}
            />
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadClusters(true)}
            refreshing={isRefreshing}
            tintColor={dashboardTheme.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <ClusterCard
            cluster={item}
            onPress={() => router.push({
              pathname: '/officer/community-clusters/[clusterId]',
              params: { clusterId: item.id }
            })}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
      <BottomNavigation items={officerBottomNavItems} />
    </View>
  );
}

function ClusterCard({
  cluster,
  onPress
}: {
  cluster: SafeCommunityReportClusterSummary;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={styles.hazardIconWrap}>
            <Image accessibilityLabel={`${cluster.hazardType} hazard`} source={hazardImageForResident(cluster.hazardType)} style={styles.hazardImage} />
          </View>
          <View>
          <Text style={styles.cardEyebrow}>COMMUNITY INCIDENT</Text>
          <Text style={styles.cardTitle}>{cluster.hazardType.replace(/_/g, ' ')}</Text>
          </View>
        </View>
        <PriorityBadge priority={cluster.highestSeverity} />
      </View>
      <View style={styles.metricRow}>
        <Metric label="Community reports" value={String(cluster.reportCount)} />
        <Metric label="Pending" value={String(cluster.pendingReportCount)} />
        <Metric label="Field checks" value={String(cluster.fieldConfirmationCount)} />
      </View>
      <Text accessibilityLabel={`${cluster.verifiedReportCount} verified, ${cluster.rejectedReportCount} rejected, ${cluster.resolvedReportCount} resolved`} style={styles.statusSummary}>
        {cluster.verifiedReportCount} verified {'\u00B7'} {cluster.rejectedReportCount} rejected {'\u00B7'} {cluster.resolvedReportCount} resolved
      </Text>
      <View style={styles.cardBodyRow}>
        <DashboardGlyph color={dashboardTheme.colors.muted} name="time-outline" size={16} />
        <Text style={styles.cardBody}>Latest report {formatDateTime(cluster.lastReportedAt)}</Text>
      </View>
      <Text style={styles.cardHint}>Review member reports</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ClusterListState({
  errorMessage,
  isLoading,
  onRetry,
  emptyLabel
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onRetry: () => void;
  emptyLabel: string;
}) {
  return (
    <View style={styles.stateCard}>
      {isLoading ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : null}
      <Text style={styles.stateTitle}>
        {isLoading ? 'Loading community incidents...' : errorMessage ? 'Community incidents could not be loaded.' : emptyLabel}
      </Text>
      {errorMessage && !isLoading ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function statusCount(cluster: SafeCommunityReportClusterSummary, status: Exclude<StatusFilter, 'ALL'>) {
  return {
    PENDING: cluster.pendingReportCount,
    VERIFIED: cluster.verifiedReportCount,
    REJECTED: cluster.rejectedReportCount,
    RESOLVED: cluster.resolvedReportCount,
    CANCELLED: cluster.cancelledReportCount
  }[status];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dashboardTheme.colors.background },
  content: { gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  headerBlock: { gap: 12, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { flex: 1, fontSize: 25, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  description: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.muted },
  modeRow: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: dashboardTheme.colors.surfaceMuted },
  modeButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeButtonActive: { backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  modeText: { fontSize: 13, fontWeight: '700', color: dashboardTheme.colors.muted },
  modeTextActive: { color: dashboardTheme.colors.primaryStrong },
  searchCard: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, color: dashboardTheme.colors.text },
  filterRow: { gap: 8 },
  filterChip: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 999, backgroundColor: dashboardTheme.colors.surface },
  filterChipActive: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  filterText: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  filterTextActive: { color: dashboardTheme.colors.primaryStrong },
  resultSummary: { fontSize: 13, fontWeight: '700', color: dashboardTheme.colors.muted },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  card: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hazardIconWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: dashboardTheme.colors.primarySoft },
  hazardImage: { width: 34, height: 34, resizeMode: 'contain' },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: dashboardTheme.colors.muted },
  cardTitle: { fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text },
  cardBody: { fontSize: 14, lineHeight: 20, color: dashboardTheme.colors.muted },
  cardBodyRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardHint: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 92, gap: 3, padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  metricValue: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  metricLabel: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  statusSummary: { fontSize: 13, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  retryText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  errorText: { fontSize: 13, color: dashboardTheme.colors.critical },
  pressed: { opacity: 0.82 }
});


