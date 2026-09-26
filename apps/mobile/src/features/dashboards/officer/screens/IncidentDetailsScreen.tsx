import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { IncidentWithReportsResponse, SafeReport } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { getIncidentDetails } from '../api/incidentApi';
import { formatIncidentLocation, formatIncidentTime, incidentGroupingErrorMessage } from '../incidentGrouping';

type DetailsStatus = 'idle' | 'loading' | 'success' | 'error';

export function IncidentDetailsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ incidentId?: string | string[] }>();
  const incidentId = Array.isArray(params.incidentId) ? params.incidentId[0] : params.incidentId;
  const [data, setData] = useState<IncidentWithReportsResponse | null>(null);
  const [status, setStatus] = useState<DetailsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const loadDetails = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setStatus('loading');
    setError(null);

    if (!incidentId) {
      setStatus('error');
      setError('The incident reference is missing from this route.');
      return;
    }
    if (!accessToken) {
      setStatus('error');
      setError('Your Officer session is unavailable. Please log in again.');
      return;
    }

    try {
      const response = await getIncidentDetails(incidentId, accessToken);
      if (requestGeneration.current !== generation) return;
      setData(response);
      setStatus('success');
    } catch (failure) {
      if (requestGeneration.current !== generation) return;
      setData(null);
      setStatus('error');
      setError(incidentGroupingErrorMessage(failure, 'Unable to load related reports right now.'));
    }
  }, [accessToken, incidentId]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
      return () => { requestGeneration.current += 1; };
    }, [loadDetails])
  );

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Back to incident candidates"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Incident</Text>
          <Text style={styles.title}>Related Reports</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {status === 'idle' || status === 'loading' ? (
        <StateCard title="Loading Related Reports" message="Retrieving the verified reports that support this incident.">
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
        </StateCard>
      ) : status === 'error' ? (
        <StateCard title="Unable to Load Related Reports" message={error ?? 'The incident details are unavailable.'}>
          <ActionButton label="Retry" onPress={() => void loadDetails()} />
        </StateCard>
      ) : data ? (
        <>
          <View style={styles.incidentCard}>
            <Text style={styles.cardEyebrow}>INCIDENT</Text>
            <Text style={styles.cardTitle}>{data.incident.hazardType.replace(/_/g, ' ')}</Text>
            <Text style={styles.cardBody}>One real-world event represented by verified report evidence.</Text>
            <Detail label="Status" value={data.incident.status} />
            <Detail label="Approximate location" value={formatIncidentLocation(data.incident.location)} />
            <Detail label="Verified reports" value={String(data.incident.reportIds.length)} />
          </View>
          <Text style={styles.sectionTitle}>Reports in this incident</Text>
          {data.reports.length ? data.reports.map((report) => <RelatedReportCard key={report.id} report={report} />) : (
            <StateCard title="No report details available" message="The incident references no readable source reports." />
          )}
        </>
      ) : null}
    </DashboardScreen>
  );
}

function RelatedReportCard({ report }: { report: SafeReport }) {
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <View style={styles.reportIcon}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="document-text-outline" size={18} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardEyebrow}>REPORT</Text>
          <Text style={styles.cardTitle}>{report.hazardType.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <Text style={styles.cardBody}>{report.description}</Text>
      <Detail label="Reported" value={formatIncidentTime(report.createdAt)} />
      <Detail label="Location" value={formatIncidentLocation(report.location)} />
      <Text selectable style={styles.reference}>Reference: {report.id}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function StateCard({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return <View style={styles.stateCard}>{children}<Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{message}</Text></View>;
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
    <Text style={styles.actionButtonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  headerCopy: { flex: 1, gap: 3 },
  headerSpacer: { width: 44 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.9, color: dashboardTheme.colors.primaryStrong },
  title: { fontSize: 25, fontWeight: '800', color: dashboardTheme.colors.text },
  incidentCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.primarySoft, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  reportCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reportIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: dashboardTheme.colors.primarySoft },
  cardCopy: { flex: 1, gap: 4 },
  cardEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, color: dashboardTheme.colors.muted },
  cardTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  cardBody: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.text },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: dashboardTheme.colors.text },
  detail: { gap: 3 },
  detailLabel: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  detailValue: { fontSize: 15, lineHeight: 21, color: dashboardTheme.colors.text },
  reference: { fontSize: 13, color: dashboardTheme.colors.muted },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  stateBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: dashboardTheme.colors.muted },
  actionButton: { minHeight: 48, minWidth: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  actionButtonText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
  pressed: { opacity: 0.65 }
});
