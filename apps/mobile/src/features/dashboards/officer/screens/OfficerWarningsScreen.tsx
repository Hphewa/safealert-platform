import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canCreateWarning, type IncidentMonitoringSummary, type WarningRiskLevel } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { listIncidentMonitoring } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { HazardImage } from '../../shared/components/HazardImage';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { BadgeTone } from '../../shared/types';
import { warningStatusCounts, warningTiming, type WarningCardStatus } from '../warningList';

// The tab only reuses the existing lifecycle vocabulary: an eligible assessment without
// a warning is "NEEDS WARNING"; otherwise the persisted DRAFT/PUBLISHED/CANCELLED/ARCHIVED status shows.
type StatusFilter = 'ALL' | WarningCardStatus;

type WarningRow = {
  assessmentId: string;
  risk: WarningRiskLevel;
  title: string;
  hazardType: string;
  location: string;
  status: WarningCardStatus;
  warningId: string | null;
  whenLabel: 'Created' | 'Published' | 'Cancelled' | 'Archived' | 'Assessed';
  whenTime: string;
};

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Needs Warning', value: 'NEEDS WARNING' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Published', value: 'PUBLISHED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Archived', value: 'ARCHIVED' }
];

function warningStatusTone(status: WarningCardStatus): BadgeTone {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'DRAFT') return 'neutral';
  if (status === 'CANCELLED') return 'high';
  if (status === 'ARCHIVED') return 'neutral';
  return 'high';
}

function warningTitle(title: string) {
  const normalized = title.toLowerCase();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} warning`;
}

export function OfficerWarningsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompactLayout = width < 600;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [filtersOpen, setFiltersOpen] = useState(true);

  const load = useCallback(async (): Promise<IncidentMonitoringSummary[]> => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return (await listIncidentMonitoring(accessToken)).incidents;
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);

  // Same eligibility rule as before (saved HIGH/CRITICAL risk only); no backend change.
  const rows = useMemo<WarningRow[]>(() => {
    const built: WarningRow[] = [];
    for (const item of data ?? []) {
      const assessment = item.currentAssessment;
      if (!assessment) continue;
      const riskLevel = assessment.finalRiskLevel;
      if (!canCreateWarning(riskLevel)) continue;
      const warning = item.warnings.find((candidate) => candidate.assessmentId === assessment.id) ?? null;
      const status: WarningCardStatus = warning ? warning.status : 'NEEDS WARNING';
      const timing = warningTiming(warning, assessment.assessedAt);
      built.push({
        assessmentId: assessment.id,
        risk: riskLevel,
        title: assessmentLabel(item.incident.hazardType),
        hazardType: item.incident.hazardType,
        location: formatIncidentLocation(item.incident.location),
        status,
        warningId: warning?.id ?? null,
        whenLabel: timing.label,
        whenTime: timing.time ? formatIncidentTime(timing.time) : 'Not recorded'
      });
    }
    return built;
  }, [data]);

  const counts = useMemo(() => warningStatusCounts(rows), [rows]);

  // Search and filter only shape the visible cards; loaded warning data stays untouched.
  const visibleRows = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (tokens.length === 0) return true;
      const haystack = [row.title, row.hazardType, row.location, row.status, row.risk]
        .join(' ').toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [rows, query, statusFilter]);

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Back to officer dashboard"
          accessibilityRole="button"
          onPress={() => router.replace('/officer')}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={assessmentStyles.title}>Warnings</Text>
          <Text style={assessmentStyles.helper}>
            Create, review, and publish warnings from eligible saved risk assessments.
          </Text>
        </View>
      </View>

      {!loading && !error ? (
        <View style={[styles.summaryRow, isCompactLayout && styles.summaryRowCompact]}>
          {([
            { label: 'Needs warning', count: counts.needsWarning, icon: 'warning-outline' },
            { label: 'Drafts', count: counts.draft, icon: 'create-outline' },
            { label: 'Published', count: counts.published, icon: 'checkmark-done-outline' },
            { label: 'Cancelled', count: counts.cancelled, icon: 'alert-circle-outline' },
            { label: 'Archived', count: counts.archived, icon: 'book-outline' }
          ]).map((tile) => (
            <View
              accessible
              accessibilityLabel={`${tile.count} ${tile.label}`}
              key={tile.label}
              style={[styles.summaryTile, !isCompactLayout && styles.summaryTileWeb]}
            >
              <View style={[styles.summaryIcon, !isCompactLayout && styles.summaryIconWeb]}>
                <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={tile.icon} size={isCompactLayout ? 18 : 21} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={[styles.summaryLabel, !isCompactLayout && styles.summaryLabelWeb]}>{tile.label}</Text>
                <Text style={[styles.summaryValue, !isCompactLayout && styles.summaryValueWeb]}>{tile.count}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}

      {!loading && !error ? (
        <>
          <View style={[styles.toolbar, isCompactLayout && styles.toolbarCompact]}>
            {rows.length > 0 ? (
              <View style={styles.searchBox}>
                <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="search-outline" size={17} />
                <TextInput
                  accessibilityHint="Matches incident title, location, risk, and status."
                  accessibilityLabel="Search warnings"
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  onChangeText={setQuery}
                  placeholder="Search by warning type, affected area, or incident"
                  placeholderTextColor={dashboardTheme.colors.muted}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={query}
                />
              </View>
            ) : <View style={styles.toolbarSpacer} />}
            <View style={styles.toolbarActions}>
              {rows.length > 0 ? (
                <Pressable
                  accessibilityLabel="Toggle warning filters"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: filtersOpen }}
                  onPress={() => setFiltersOpen((current) => !current)}
                  style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="list-outline" size={16} />
                  <Text style={styles.filterButtonText}>Filter</Text>
                  <Text style={styles.filterChevron}>{filtersOpen ? '⌃' : '⌄'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Refresh warnings"
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
                disabled={loading}
                onPress={() => void reload()}
                style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed, loading && styles.disabled]}
              >
                <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="refresh-outline" size={16} />
                <Text style={styles.refreshText}>Refresh warnings</Text>
              </Pressable>
            </View>
          </View>

          {rows.length > 0 && filtersOpen ? (
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((option) => {
                const selected = statusFilter === option.value;
                return (
                  <Pressable
                    accessibilityLabel={`Filter ${option.label}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.value}
                    onPress={() => setStatusFilter(option.value)}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={assessmentStyles.body}>
                No high or critical warnings currently require attention.
              </Text>
            </View>
          ) : visibleRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={assessmentStyles.body}>No warnings match your search.</Text>
            </View>
          ) : (
            visibleRows.map((row) => {
              const warningId = row.warningId;
              const actionLabel = warningId
                ? row.status === 'DRAFT' ? 'Review draft' : 'View details'
                : 'Create warning';
              const openWarning = () => {
                if (warningId) {
                  router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId, mode: row.status === 'PUBLISHED' ? 'published' : row.status === 'DRAFT' ? 'draft' : 'view', returnTo: '/officer/warnings' } });
                  return;
                }
                router.push({ pathname: '/officer/warnings/create', params: { assessmentId: row.assessmentId, returnTo: '/officer/warnings' } });
              };
              return (
                <View
                  key={row.assessmentId}
                  style={[assessmentStyles.card, styles.warningCard]}
                >
                  <View
                    pointerEvents="none"
                    style={styles.warningAccent}
                  />
                  <View style={[styles.warningLayout, isCompactLayout && styles.warningLayoutCompact]}>
                    <View style={styles.warningIcon}>
                      <HazardImage hazardType={row.hazardType} size={42} />
                    </View>
                    <View style={styles.warningContent}>
                      <View style={styles.warningTitleRow}>
                        <Text style={styles.warningTitle}>{warningTitle(row.title)}</Text>
                        <View style={styles.badgeRow}>
                          <PriorityBadge priority={row.risk} />
                          <StatusBadge label={row.status} tone={warningStatusTone(row.status)} />
                        </View>
                      </View>
                      <View style={styles.locationRow}>
                        <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={15} />
                        <Text style={styles.locationText}>{row.location}</Text>
                      </View>
                      <View style={styles.dateRow}>
                        <DashboardGlyph color={dashboardTheme.colors.muted} name="time-outline" size={14} />
                        <Text style={styles.dateTime}>{`${row.whenLabel}: ${row.whenTime}`}</Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityLabel={`${actionLabel} for ${warningTitle(row.title)}`}
                      accessibilityRole="button"
                      onPress={openWarning}
                      style={({ pressed }) => [
                        styles.warningAction,
                        !warningId && styles.createAction,
                        warningId && row.status === 'DRAFT' && styles.draftAction,
                        pressed && styles.pressed
                      ]}
                    >
                      <Text style={[styles.warningActionText, (!warningId || row.status === 'DRAFT') && styles.primaryActionText]}>{actionLabel}</Text>
                      <DashboardGlyph color={!warningId || row.status === 'DRAFT' ? '#ffffff' : dashboardTheme.colors.primaryStrong} name="chevron-forward" size={16} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : null}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  headerCopy: { flex: 1, gap: 2 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryRowCompact: { flexWrap: 'wrap' },
  summaryTile: { flex: 1, minWidth: 112, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 16, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  summaryTileWeb: { minHeight: 78, gap: 12, paddingVertical: 14, paddingHorizontal: 15 },
  summaryIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: dashboardTheme.colors.surfaceMuted },
  summaryIconWeb: { width: 42, height: 42, borderRadius: 21 },
  summaryCopy: { flex: 1, gap: 1 },
  summaryValue: { fontSize: 20, lineHeight: 23, fontWeight: '800', color: dashboardTheme.colors.text },
  summaryValueWeb: { fontSize: 24, lineHeight: 28 },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: dashboardTheme.colors.muted },
  summaryLabelWeb: { fontSize: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolbarCompact: { flexDirection: 'column', alignItems: 'stretch' },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolbarSpacer: { flex: 1 },
  searchBox: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 13, color: dashboardTheme.colors.text },
  filterButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface },
  filterButtonText: { fontSize: 13, fontWeight: '700', color: dashboardTheme.colors.text },
  filterChevron: { marginLeft: 2, fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  refreshButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 12, backgroundColor: dashboardTheme.colors.primarySoft },
  refreshText: { fontSize: 12, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  disabled: { opacity: 0.55 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 13, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 999, backgroundColor: dashboardTheme.colors.surface },
  chipSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  chipText: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.text },
  chipTextSelected: { color: dashboardTheme.colors.primaryStrong },
  warningCard: { position: 'relative', gap: 8, padding: 14, paddingLeft: 18, borderRadius: 16, ...cardShadow },
  warningAccent: { position: 'absolute', top: 12, bottom: 12, left: 7, width: 3, borderRadius: 2, backgroundColor: dashboardTheme.colors.border },
  warningLayout: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warningLayoutCompact: { flexDirection: 'column', alignItems: 'stretch' },
  warningIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  highIcon: { backgroundColor: dashboardTheme.colors.surfaceMuted },
  criticalIcon: { backgroundColor: dashboardTheme.colors.surfaceMuted },
  warningContent: { flex: 1, gap: 5, minWidth: 0 },
  warningTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  warningTitle: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: dashboardTheme.colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateTime: { fontSize: 11, fontWeight: '600', color: dashboardTheme.colors.muted },
  warningAction: { minWidth: 126, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 10, backgroundColor: dashboardTheme.colors.surface },
  draftAction: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary },
  createAction: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primary },
  warningActionText: { fontSize: 12, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  primaryActionText: { color: '#ffffff' },
  emptyCard: { gap: 6, alignItems: 'center', padding: 18, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  pressed: { opacity: 0.65 }
});
