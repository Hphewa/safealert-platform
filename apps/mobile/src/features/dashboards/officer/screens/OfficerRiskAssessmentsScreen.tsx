import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { IncidentWithReportsResponse } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { dashboardTheme, cardShadow } from '../../shared/theme';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { officerBottomNavItems } from '../officerNavigation';
import { listInitialAssessmentQueue } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { latestIncidentReportAt } from '../assessmentIncidents';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';
import {
  assessmentQueueFilters,
  filterAssessmentQueue,
  formatAssessmentHazard,
  formatAssessmentRelativeTime
} from '../assessmentQueuePresentation';

export function OfficerRiskAssessmentsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const { resetAssessmentDraft } = useRiskAssessmentDraft();
  const [selectedHazard, setSelectedHazard] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlight = useRef(false);
  const load = useCallback(async (): Promise<IncidentWithReportsResponse[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    const { incidents } = await listInitialAssessmentQueue(accessToken);
    return incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const queue = data ?? [];
  const filters = useMemo(() => assessmentQueueFilters(queue, selectedHazard), [queue, selectedHazard]);
  const visibleIncidents = useMemo(() => filterAssessmentQueue(queue, filters.selectedHazard), [queue, filters.selectedHazard]);

  useEffect(() => {
    if (selectedHazard && !queue.some((item) => item.incident.hazardType === selectedHazard)) setSelectedHazard(null);
  }, [queue, selectedHazard]);

  const refresh = useCallback(async () => {
    if (loading || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    try {
      await reload({ preserveData: true });
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [loading, reload]);

  const openIncident = useCallback((incident: IncidentWithReportsResponse) => {
    resetAssessmentDraft();
    router.push({ pathname: '/officer/assessments/incident/[incidentId]', params: { incidentId: incident.incident.id } });
  }, [resetAssessmentDraft, router]);

  const countLabel = data === null ? null : `${queue.length} ${queue.length === 1 ? 'incident needs' : 'incidents need'} assessment`;

  return <DashboardScreen bottomNavItems={officerBottomNavItems}
    refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={isRefreshing} tintColor={dashboardTheme.colors.primary} />}>
    <View style={styles.header}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>Risk Assessments</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Risk Map" onPress={() => router.push('/officer/risk-map')} style={styles.mapAction}>
          <DashboardGlyph name="map-outline" color={dashboardTheme.colors.primary} size={16} />
          <Text style={styles.retryText}>Risk Map</Text>
        </Pressable>
      </View>
      {countLabel ? <Text style={styles.count}>{countLabel}</Text> : null}
    </View>

    {data !== null && queue.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters} accessibilityLabel="Filter incidents by hazard">
      {filters.options.map((filter) => {
        const selected = filter.hazardType === filters.selectedHazard;
        const key = filter.hazardType ?? 'all';
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }}
          accessibilityLabel={`${filter.label}, ${filter.count} incidents${selected ? ', selected' : ''}`}
          onPress={() => setSelectedHazard(filter.hazardType)}
          style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}>
          <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{filter.label} {filter.count}</Text>
        </Pressable>;
      })}
    </ScrollView> : null}

    {loading && data === null ? <View style={styles.stateCard}>
      <ActivityIndicator color={dashboardTheme.colors.primary} />
      <Text style={styles.stateBody}>Loading risk assessments...</Text>
    </View> : null}
    {error ? <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>Unable to load risk assessments.</Text>
      <Text style={styles.stateBody}>Check your connection and try again.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Try Again" onPress={() => void refresh()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View> : null}

    {data !== null && queue.length === 0 ? <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>All caught up</Text>
      <Text style={styles.stateBody}>There are no incidents waiting for an initial risk assessment.</Text>
    </View> : null}
    {data !== null && queue.length > 0 && visibleIncidents.length === 0 ? <AssessmentQueueFilteredEmptyState
      hazard={filters.selectedHazard ?? ''} onShowAll={() => setSelectedHazard(null)} /> : null}
    {data !== null && visibleIncidents.map((incident) => <AssessmentQueueCard key={incident.incident.id} incident={incident}
      onPress={() => openIncident(incident)} />)}
  </DashboardScreen>;
}

export function AssessmentQueueFilteredEmptyState({ hazard, onShowAll }: { hazard: string; onShowAll: () => void }) {
  return <View style={styles.stateCard}>
    <Text style={styles.stateTitle}>No matching incidents</Text>
    <Text style={styles.stateBody}>There are no {formatAssessmentHazard(hazard)} incidents waiting for assessment.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Show all" onPress={onShowAll} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
      <Text style={styles.retryText}>Show all</Text>
    </Pressable>
  </View>;
}

function AssessmentQueueCard({ incident, onPress }: { incident: IncidentWithReportsResponse; onPress: () => void }) {
  const hazard = formatAssessmentHazard(incident.incident.hazardType);
  const reportCount = incident.reports.length;
  const icon = hazardIcon(incident.incident.hazardType);
  const latestReportAt = latestIncidentReportAt(incident);
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${hazard} incident overview`}
    accessibilityHint="Review verified evidence before starting an assessment" onPress={onPress}
    style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.cardHeader}>
      <View style={styles.hazardHeading}>
        <View style={styles.hazardIcon}><DashboardGlyph name={icon} color={dashboardTheme.colors.primaryStrong} size={18} /></View>
        <Text style={styles.hazardTitle}>{hazard}</Text>
      </View>
      <StatusBadge label="NEEDS ASSESSMENT" tone="info" />
    </View>
    <View style={styles.locationRow}>
      <DashboardGlyph name="locate-outline" color={dashboardTheme.colors.muted} size={15} />
      <HumanReadableLocation location={incident.incident.location} style={styles.location} numberOfLines={1} />
    </View>
    <View style={styles.cardDetails}>
      <Text style={styles.detail}>{reportCount} verified {reportCount === 1 ? 'report' : 'reports'}</Text>
      <Text style={styles.detail}>{formatAssessmentRelativeTime(latestReportAt ?? '')}</Text>
    </View>
    <View style={styles.cardAction}>
      <Text style={styles.cardActionText}>View incident</Text>
      <DashboardGlyph name="chevron-forward" color={dashboardTheme.colors.primaryStrong} size={17} />
    </View>
  </Pressable>;
}

function hazardIcon(value: string) {
  switch (value) {
    case 'FLOOD': return 'water-outline';
    case 'BLOCKED_ROAD': return 'trail-sign-outline';
    case 'LANDSLIDE': return 'warning-outline';
    case 'OTHER': return 'help-circle-outline';
    default: return 'warning-outline';
  }
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mapAction: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: dashboardTheme.colors.primarySoft, borderRadius: 12 },
  header: { gap: 4 },
  title: { fontSize: 26, fontWeight: '800', color: dashboardTheme.colors.text },
  count: { fontSize: 15, fontWeight: '600', color: dashboardTheme.colors.muted },
  filters: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filterChip: { minHeight: 42, paddingHorizontal: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.surface },
  filterChipSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  filterText: { fontSize: 13, fontWeight: '700', color: dashboardTheme.colors.muted },
  filterTextSelected: { color: dashboardTheme.colors.primaryStrong },
  card: { gap: 10, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hazardHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  hazardIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.primarySoft },
  hazardTitle: { flexShrink: 1, fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  location: { flex: 1, fontSize: 14, fontWeight: '600', color: dashboardTheme.colors.text },
  cardDetails: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 4 },
  detail: { fontSize: 13, color: dashboardTheme.colors.muted },
  cardAction: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 8 },
  cardActionText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  stateCard: { gap: 10, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  stateBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: dashboardTheme.colors.muted },
  retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  retryText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  pressed: { opacity: 0.82 }
});
