import { useCallback, useEffect, useRef, useState } from 'react';
import type { SafeCommunityReportClusterDetail } from '@safealert/contracts';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { MultiMarkerLocationPreview, type MultiMarkerLocation } from '../../shared/maps/MultiMarkerLocationPreview';
import { geoJsonPointToMapCoordinates } from '../../shared/maps/types';
import { reverseGeocodePlace } from '../../shared/maps/locationSearch';
import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { dashboardTheme } from '../../shared/theme';
import { badgeToneForReportStatus } from '../../shared/utils';
import { officerBottomNavItems } from '../officerNavigation';
import { getOfficerCommunityReportCluster } from '../api/communityReportClusterApi';
import { hazardImageForResident } from '../../resident/reports';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export function OfficerCommunityClusterDetailsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ clusterId?: string | string[] }>();
  const clusterId = Array.isArray(params.clusterId) ? params.clusterId[0] : params.clusterId;
  const [cluster, setCluster] = useState<SafeCommunityReportClusterDetail | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationPlace, setLocationPlace] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadCluster = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('loading');
    setErrorMessage(null);

    if (!clusterId || !accessToken) {
      setStatus('error');
      setErrorMessage('This community incident is no longer available.');
      return;
    }

    try {
      const response = await getOfficerCommunityReportCluster(clusterId, accessToken);
      if (requestIdRef.current !== requestId) return;
      setCluster(response.cluster);
      setStatus('success');
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setCluster(null);
      setStatus('error');
      setErrorMessage(error instanceof ApiClientError || error instanceof Error
        ? error.message
        : 'This community incident is no longer available.');
    }
  }, [accessToken, clusterId]);

  useFocusEffect(useCallback(() => {
    void loadCluster();
    return () => { requestIdRef.current += 1; };
  }, [loadCluster]));

  useEffect(() => {
    if (!cluster) {
      setLocationPlace(null);
      return;
    }

    let active = true;
    const [longitude, latitude] = cluster.centerLocation.coordinates;
    void reverseGeocodePlace(latitude, longitude).then((place) => {
      if (active) setLocationPlace(place);
    });
    return () => {
      active = false;
    };
  }, [cluster]);

  const markers: MultiMarkerLocation[] = cluster?.reports.flatMap((report, index) => {
    const coordinates = geoJsonPointToMapCoordinates(report.location);
    return coordinates ? [{ ...coordinates, id: report.id, label: `Report ${index + 1}` }] : [];
  }) ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Community Incident</Text>
          <View style={styles.headerSpacer} />
        </View>

        {status === 'loading' || status === 'idle' ? (
          <StateCard title="Loading community incident..." />
        ) : status === 'error' || !cluster ? (
          <StateCard title={errorMessage ?? 'This community incident is no longer available.'} onRetry={() => void loadCluster()} />
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View>
                  <Text style={styles.eyebrow}>RELATED COMMUNITY REPORTS</Text>
                  <Text style={styles.title}>{cluster.hazardType.replace(/_/g, ' ')}</Text>
                </View>
                <PriorityBadge priority={cluster.highestSeverity} />
              </View>
              <View style={styles.metricRow}>
                <Metric label="Reports" value={String(cluster.reportCount)} />
                <Metric label="Pending" value={String(cluster.pendingReportCount)} />
                <Metric label="Field checks" value={String(cluster.fieldConfirmationCount)} />
              </View>
              <View style={styles.locationRow}>
                <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="location-outline" size={18} />
                <Text style={styles.bodyText}>{locationPlace ?? 'Finding incident location…'}</Text>
              </View>
              <Text style={styles.bodyText}>First reported {formatDateTime(cluster.firstReportedAt)}</Text>
              <Text style={styles.bodyText}>Latest community report {formatDateTime(cluster.lastReportedAt)}</Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Reported Locations</Text>
              <MultiMarkerLocationPreview locations={markers} />
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Member Reports</Text>
              {cluster.reports.map((report) => (
                <View key={report.id} style={styles.reportCard}>
                  <View style={styles.reportHeader}>
                  <View style={styles.reportTitleRow}>
                    <Image accessibilityLabel={`${report.hazardType} hazard`} source={hazardImageForResident(report.hazardType)} style={styles.reportHazardImage} />
                    <Text style={styles.reportTitle}>{report.hazardType.replace(/_/g, ' ')}</Text>
                  </View>
                    <StatusBadge label={report.status} tone={badgeToneForReportStatus(report.status)} />
                  </View>
                  <Text style={styles.bodyText}>{report.description}</Text>
                  <Text style={styles.metaText}>Reported {formatDateTime(report.createdAt)}</Text>
                  <View style={styles.evidenceRow}>
                    <EvidenceItem active={Boolean(report.mediaReference)} icon="camera-outline" label="Photo" />
                    <EvidenceItem active={Boolean(report.voiceEvidence)} icon="mic-outline" label="Voice" />
                    <EvidenceItem active={report.fieldConfirmationCount > 0} icon="people-outline" label={`${report.fieldConfirmationCount} field`} />
                  </View>
                  {report.status === 'PENDING' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/officer/reports/[reportId]', params: { reportId: report.id } })}
                      style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.reviewButtonText}>Review This Report</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <BottomNavigation items={officerBottomNavItems} />
    </View>
  );
}

function StateCard({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateCard}>
      {!onRetry ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : null}
      <Text style={styles.stateTitle}>{title}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
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

function EvidenceItem({ active, icon, label }: { active: boolean; icon: 'camera-outline' | 'mic-outline' | 'people-outline'; label: string }) {
  return (
    <View style={[styles.evidenceItem, !active && styles.evidenceItemInactive]}>
      <DashboardGlyph color={active ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.muted} name={icon} size={14} />
      <Text style={[styles.evidenceLabel, !active && styles.evidenceLabelInactive]}>{label}</Text>
    </View>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dashboardTheme.colors.background },
  content: { gap: 14, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  headerTitle: { flex: 1, fontSize: 25, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  headerSpacer: { width: 44 },
  summaryCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  summaryHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: dashboardTheme.colors.muted },
  title: { fontSize: 23, fontWeight: '800', color: dashboardTheme.colors.text },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 90, gap: 3, padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  metricValue: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  metricLabel: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  panel: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  panelTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  reportCard: { gap: 10, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reportTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  reportHazardImage: { width: 28, height: 28, resizeMode: 'contain' },
  reportTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.text },
  bodyText: { fontSize: 14, lineHeight: 20, color: dashboardTheme.colors.text },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metaText: { fontSize: 13, lineHeight: 19, color: dashboardTheme.colors.muted },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: dashboardTheme.colors.primarySoft },
  evidenceItemInactive: { backgroundColor: dashboardTheme.colors.surfaceMuted },
  evidenceLabel: { fontSize: 11, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  evidenceLabelInactive: { color: dashboardTheme.colors.muted },
  reviewButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  reviewButtonText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  retryText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  pressed: { opacity: 0.82 }
});
