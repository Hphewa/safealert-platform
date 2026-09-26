import { useCallback, useRef, useState } from 'react';
import type { SafeCommunityReportClusterSummary } from '@safealert/contracts';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { listOfficerCommunityReportClusters } from '../api/communityReportClusterApi';

type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function OfficerCommunityClustersScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [clusters, setClusters] = useState<SafeCommunityReportClusterSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const latestRequestIdRef = useRef(0);

  const loadClusters = useCallback(async (isRefresh = false) => {
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
      const response = await listOfficerCommunityReportClusters(accessToken);
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
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    void loadClusters();
    return () => {
      latestRequestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [loadClusters]));

  const isLoading = loadStatus === 'idle' || loadStatus === 'loading';
  const isRefreshing = loadStatus === 'refreshing';

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={clusters}
        keyExtractor={(item) => item.id}
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
            <Text style={styles.description}>
              Review related pending community reports that may describe the same hazard.
            </Text>
            {errorMessage && clusters.length ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <ClusterListState
            errorMessage={errorMessage}
            isLoading={isLoading}
            onRetry={() => void loadClusters(true)}
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
        <View>
          <Text style={styles.cardEyebrow}>COMMUNITY INCIDENT</Text>
          <Text style={styles.cardTitle}>{cluster.hazardType.replace(/_/g, ' ')}</Text>
        </View>
        <PriorityBadge priority={cluster.highestSeverity} />
      </View>
      <View style={styles.metricRow}>
        <Metric label="Community reports" value={String(cluster.reportCount)} />
        <Metric label="Pending" value={String(cluster.pendingReportCount)} />
        <Metric label="Field checks" value={String(cluster.fieldConfirmationCount)} />
      </View>
      <Text style={styles.cardBody}>Latest community report: {formatDateTime(cluster.lastReportedAt)}</Text>
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
  onRetry
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      {isLoading ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : null}
      <Text style={styles.stateTitle}>
        {isLoading ? 'Loading community incidents...' : errorMessage ? 'Community incidents could not be loaded.' : 'No community incident groups are waiting for review.'}
      </Text>
      {errorMessage && !isLoading ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dashboardTheme.colors.background },
  content: { gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  headerBlock: { gap: 14, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerTitle: { flex: 1, fontSize: 25, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  description: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.muted },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  card: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardEyebrow: { fontSize: 11, fontWeight: '800', color: dashboardTheme.colors.muted },
  cardTitle: { fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text },
  cardBody: { fontSize: 14, lineHeight: 20, color: dashboardTheme.colors.muted },
  cardHint: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 92, gap: 3, padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  metricValue: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  metricLabel: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  retryText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  errorText: { fontSize: 13, color: dashboardTheme.colors.critical },
  pressed: { opacity: 0.82 }
});

