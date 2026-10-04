import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { IncidentCandidate } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import {
  attachReportToIncident,
  createIncidentFromReport,
  getIncidentCandidates
} from '../api/incidentApi';
import {
  formatIncidentDistance,
  formatIncidentTime,
  incidentGroupingErrorMessage
} from '../incidentGrouping';

type GroupingLoadStatus = 'idle' | 'loading' | 'success' | 'error';
type GroupingAction = 'create' | 'attach';

export function IncidentGroupingScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const [candidates, setCandidates] = useState<IncidentCandidate[]>([]);
  const [loadStatus, setLoadStatus] = useState<GroupingLoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const actionInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const loadCandidates = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setLoadStatus('loading');
    setLoadError(null);
    setActionError(null);
    setSuccessMessage(null);

    if (!reportId) {
      setLoadStatus('error');
      setLoadError('The verified report reference is missing from this route.');
      return;
    }

    if (!accessToken) {
      setLoadStatus('error');
      setLoadError('Your Officer session is unavailable. Please log in again.');
      return;
    }

    try {
      const response = await getIncidentCandidates(reportId, accessToken);
      if (requestGeneration.current !== generation) return;
      setCandidates(response.candidates);
      setLoadStatus('success');
    } catch (error) {
      if (requestGeneration.current !== generation) return;
      setCandidates([]);
      setLoadStatus('error');
      setLoadError(incidentGroupingErrorMessage(error, 'Unable to check related incidents right now.'));
    }
  }, [accessToken, reportId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGeneration.current += 1;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCandidates();
      return () => {
        requestGeneration.current += 1;
      };
    }, [loadCandidates])
  );

  const submitGrouping = async (action: GroupingAction, incidentId?: string) => {
    if (actionInFlightRef.current || !accessToken || !reportId) return;
    if (action === 'attach' && !incidentId) return;

    actionInFlightRef.current = true;
    setActiveAction(action === 'attach' ? incidentId ?? null : action);
    setActionError(null);
    const generation = requestGeneration.current;

    try {
      if (action === 'attach') {
        await attachReportToIncident(incidentId!, reportId, accessToken);
        if (requestGeneration.current === generation && mountedRef.current) {
          setSuccessMessage('Report added to incident successfully');
        }
      } else {
        await createIncidentFromReport(reportId, accessToken);
        if (requestGeneration.current === generation && mountedRef.current) {
          setSuccessMessage('Incident created successfully');
        }
      }
    } catch (error) {
      if (requestGeneration.current === generation && mountedRef.current) {
        setActionError(incidentGroupingErrorMessage(error));
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setActiveAction(null);
    }
  };

  const isLoading = loadStatus === 'idle' || loadStatus === 'loading';
  const isBusy = activeAction !== null;

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Back to verified reports"
          accessibilityRole="button"
          onPress={() => router.replace('/officer/assessments')}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Incident Grouping</Text>
          <Text style={styles.title}>Group Verified Report</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.reportCard}>
        <View style={styles.reportBadge}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="document-text-outline" size={18} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardEyebrow}>REPORT</Text>
          <Text style={styles.cardTitle}>Selected verified report</Text>
          <Text selectable style={styles.cardBody}>{reportId ?? 'Report reference unavailable'}</Text>
          <Text style={styles.helper}>
            A report is one resident or community observation. An incident groups verified reports describing one real-world event.
          </Text>
        </View>
      </View>

      {successMessage ? (
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <DashboardGlyph color={dashboardTheme.colors.success} name="checkmark-circle-outline" size={24} />
          </View>
          <Text style={styles.successTitle}>{successMessage}</Text>
          <Text style={styles.successBody}>The original report remains available as source evidence for the incident.</Text>
          <ActionButton label="Continue to Risk Assessments" onPress={() => router.replace('/officer/assessments')} />
        </View>
      ) : (
        <>
          {actionError ? (
            <View style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text>
              <ActionButton label="Refresh Candidates" secondary onPress={() => void loadCandidates()} />
            </View>
          ) : null}

          {isLoading ? (
            <StateCard title="Checking Related Incidents" message="Searching active incidents for possible related evidence.">
              <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
            </StateCard>
          ) : loadStatus === 'error' ? (
            <StateCard title="Unable to Check Related Incidents" message={loadError ?? 'The incident search is unavailable.'}>
              <ActionButton label="Retry" onPress={() => void loadCandidates()} />
            </StateCard>
          ) : candidates.length === 0 ? (
            <StateCard title="No related active incident was found." message="The officer decides whether this verified report should start a new incident.">
              <ActionButton
                label={activeAction === 'create' ? 'Creating Incident...' : 'CREATE NEW INCIDENT'}
                disabled={isBusy}
                onPress={() => void submitGrouping('create')}
              />
            </StateCard>
          ) : (
            <View style={styles.candidateSection}>
              <Text style={styles.sectionTitle}>Possible Related Incident Found</Text>
              <Text style={styles.sectionBody}>Candidates are assistance only. Review the related reports before making the grouping decision.</Text>
              {candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.incidentId}
                  candidate={candidate}
                  actionBusy={activeAction === candidate.incidentId}
                  disabled={isBusy}
                  onAttach={() => void submitGrouping('attach', candidate.incidentId)}
                  onView={() => router.push({ pathname: '/officer/incidents/[incidentId]', params: { incidentId: candidate.incidentId } })}
                />
              ))}
              <ActionButton
                label={activeAction === 'create' ? 'Creating Incident...' : 'CREATE NEW INCIDENT'}
                disabled={isBusy}
                onPress={() => void submitGrouping('create')}
              />
            </View>
          )}
        </>
      )}
    </DashboardScreen>
  );
}

function CandidateCard({
  candidate,
  actionBusy,
  disabled,
  onAttach,
  onView
}: {
  candidate: IncidentCandidate;
  actionBusy: boolean;
  disabled: boolean;
  onAttach: () => void;
  onView: () => void;
}) {
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View>
          <Text style={styles.cardEyebrow}>INCIDENT</Text>
          <Text style={styles.cardTitle}>{candidate.hazardType.replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.candidateDistance}>{formatIncidentDistance(candidate.distanceMeters)}</Text>
      </View>
      <View style={styles.detailsGrid}>
        <View style={styles.detail}><Text style={styles.detailLabel}>Approximate location</Text><HumanReadableLocation location={candidate.location} style={styles.detailValue} /></View>
        <Detail label="Verified reports" value={String(candidate.reportCount)} />
        <Detail label="Recent report" value={formatIncidentTime(candidate.latestReportAt)} />
      </View>
      <ActionButton
        label={actionBusy ? 'Adding Report...' : 'ADD TO EXISTING INCIDENT'}
        disabled={disabled}
        onPress={onAttach}
      />
      <ActionButton label="VIEW RELATED REPORTS" secondary disabled={disabled} onPress={onView} />
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function StateCard({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return <View style={styles.stateCard}>{children}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{message}</Text></View>;
}

function ActionButton({ label, onPress, disabled = false, secondary = false }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, secondary && styles.secondaryButton, (disabled || pressed) && styles.pressed]}
    >
      <Text style={[styles.actionButtonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  headerCopy: { flex: 1, gap: 3 },
  headerSpacer: { width: 44 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.9, color: dashboardTheme.colors.primaryStrong },
  title: { fontSize: 25, fontWeight: '800', color: dashboardTheme.colors.text },
  reportCard: { flexDirection: 'row', gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.primarySoft, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  reportBadge: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: dashboardTheme.colors.primarySoft },
  cardCopy: { flex: 1, gap: 5 },
  cardEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, color: dashboardTheme.colors.muted },
  cardTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  cardBody: { fontSize: 14, lineHeight: 20, color: dashboardTheme.colors.text },
  helper: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  candidateSection: { gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: dashboardTheme.colors.text },
  sectionBody: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.muted },
  candidateCard: { gap: 13, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  candidateHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  candidateDistance: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  detailsGrid: { gap: 10, paddingVertical: 4 },
  detail: { gap: 3 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  detailValue: { fontSize: 15, lineHeight: 21, color: dashboardTheme.colors.text },
  actionButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  actionButtonText: { fontSize: 14, fontWeight: '800', color: '#ffffff', textAlign: 'center' },
  secondaryButton: { backgroundColor: dashboardTheme.colors.primarySoft },
  secondaryButtonText: { color: dashboardTheme.colors.primaryStrong },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  stateBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: dashboardTheme.colors.muted },
  errorCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.criticalSoft, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  errorText: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.critical },
  successCard: { gap: 14, alignItems: 'center', padding: 22, borderWidth: 1, borderColor: dashboardTheme.colors.successSoft, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  successIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: dashboardTheme.colors.successSoft },
  successTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  successBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: dashboardTheme.colors.muted },
  pressed: { opacity: 0.65 }
});
