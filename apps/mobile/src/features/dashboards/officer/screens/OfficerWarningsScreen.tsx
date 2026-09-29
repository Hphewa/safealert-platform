import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { canCreateWarning, type IncidentMonitoringSummary, type WarningRiskLevel } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { listIncidentMonitoring } from '../api/incidentApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentLoadState, assessmentLabel, assessmentStyles } from '../components/RiskAssessmentComponents';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { officerBottomNavItems } from '../officerNavigation';
import { formatIncidentLocation, formatIncidentTime } from '../incidentGrouping';
import { dashboardTheme } from '../../shared/theme';
import type { BadgeTone } from '../../shared/types';

// The tab only reuses the existing lifecycle vocabulary: an eligible assessment without
// a warning is "NEEDS WARNING"; otherwise the persisted DRAFT/PUBLISHED/CANCELLED/ARCHIVED status shows.
type WarningCardStatus = 'NEEDS WARNING' | 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED';
type StatusFilter = 'ALL' | WarningCardStatus;

type WarningRow = {
  assessmentId: string;
  risk: WarningRiskLevel;
  title: string;
  hazardType: string;
  location: string;
  status: WarningCardStatus;
  warningId: string | null;
  whenLabel: 'Created' | 'Published' | 'Assessed';
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

export function OfficerWarningsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

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
      built.push({
        assessmentId: assessment.id,
        risk: riskLevel,
        title: assessmentLabel(item.incident.hazardType),
        hazardType: item.incident.hazardType,
        location: formatIncidentLocation(item.incident.location),
        status,
        warningId: warning?.id ?? null,
        whenLabel: warning ? (warning.publishedAt ? 'Published' : 'Created') : 'Assessed',
        whenTime: formatIncidentTime(warning?.publishedAt ?? warning?.createdAt ?? assessment.assessedAt)
      });
    }
    return built;
  }, [data]);

  const counts = useMemo(() => {
    let needsWarning = 0;
    let draft = 0;
    let published = 0;
    for (const row of rows) {
      if (row.status === 'NEEDS WARNING') needsWarning += 1;
      else if (row.status === 'DRAFT') draft += 1;
      else published += 1;
    }
    return { needsWarning, draft, published };
  }, [rows]);

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
        <View style={styles.summaryRow}>
          {([
            { label: 'Needs Warning', count: counts.needsWarning },
            { label: 'Draft', count: counts.draft },
            { label: 'Published', count: counts.published }
          ]).map((tile) => (
            <View
              accessible
              accessibilityLabel={`${tile.count} ${tile.label}`}
              key={tile.label}
              style={styles.summaryTile}
            >
              <Text style={styles.summaryValue}>{tile.count}</Text>
              <Text style={styles.summaryLabel}>{tile.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <AssessmentButton label="Refresh warnings" secondary disabled={loading} onPress={() => void reload()} />
      {loading || error ? <AssessmentLoadState loading={loading} error={error} retry={() => void reload()} /> : null}

      {!loading && !error ? (
        <>
          {rows.length > 0 ? (
            <>
              <TextInput
                accessibilityHint="Matches incident title, location, risk, and status."
                accessibilityLabel="Search warnings"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setQuery}
                placeholder="Search warnings..."
                placeholderTextColor={dashboardTheme.colors.muted}
                returnKeyType="search"
                style={assessmentStyles.input}
                value={query}
              />
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
            </>
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
              return (
                <View
                  key={row.assessmentId}
                  style={[
                    assessmentStyles.card,
                    styles.warningCard,
                    row.risk === 'CRITICAL' ? styles.criticalCard : styles.highCard
                  ]}
                >
                  <View style={styles.badgeRow}>
                    <PriorityBadge priority={row.risk} />
                    <StatusBadge label={row.status} tone={warningStatusTone(row.status)} />
                  </View>
                  <Text style={assessmentStyles.heading}>{row.title}</Text>
                  <Text style={assessmentStyles.helper}>Location: {row.location}</Text>
                  <Text style={styles.dateTime}>{`${row.whenLabel}: ${row.whenTime}`}</Text>
                  {warningId ? (
                    <AssessmentButton
                      label={row.status === 'PUBLISHED' ? 'View Published Warning' : row.status === 'DRAFT' ? 'View/Edit Draft' : 'View Warning'}
                      onPress={() => router.push({ pathname: '/officer/warnings/[warningId]', params: { warningId } })}
                    />
                  ) : (
                    <AssessmentButton
                      label="Create Warning"
                      onPress={() => router.push({ pathname: '/officer/warnings/create', params: { assessmentId: row.assessmentId } })}
                    />
                  )}
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
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  headerCopy: { flex: 1, gap: 2 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryTile: { flex: 1, gap: 2, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface },
  summaryValue: { fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text },
  summaryLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: dashboardTheme.colors.muted },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 12, backgroundColor: dashboardTheme.colors.surface },
  chipSelected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  chipText: { fontSize: 13, fontWeight: '600', color: dashboardTheme.colors.text },
  chipTextSelected: { color: dashboardTheme.colors.primaryStrong },
  warningCard: { gap: 8, padding: 14, borderLeftWidth: 5 },
  highCard: { borderLeftColor: dashboardTheme.colors.high },
  criticalCard: { borderLeftColor: dashboardTheme.colors.critical },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  dateTime: { fontSize: 13, fontWeight: '600', color: dashboardTheme.colors.muted },
  emptyCard: { gap: 6, alignItems: 'center', padding: 18, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  pressed: { opacity: 0.65 }
});
