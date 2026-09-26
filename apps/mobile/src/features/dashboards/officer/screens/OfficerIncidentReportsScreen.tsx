import { useCallback, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { listVerifiedOfficerReports } from '../api/officerReportsApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { formatIncidentLocation, incidentGroupingErrorMessage } from '../incidentGrouping';

export function OfficerIncidentReportsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    return listVerifiedOfficerReports(accessToken);
  }, [accessToken]);
  const { data, loading, error, reload } = useAssessmentResource(load);
  const reports = data?.reports ?? [];

  return (
    <DashboardScreen bottomNavItems={officerBottomNavItems} contentContainerStyle={styles.content}>
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
          <Text style={styles.eyebrow}>Incident Grouping</Text>
          <Text style={styles.title}>Verified Reports</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.description}>
        Select one verified report to check possible related incidents. The officer makes every final grouping decision.
      </Text>
      <View style={styles.definitionCard}>
        <Text style={styles.definitionTitle}>Report vs Incident</Text>
        <Text style={styles.definitionBody}>A report is one observation. An incident is a group of verified reports describing one real-world event.</Text>
      </View>

      {loading ? (
        <StateCard title="Loading Verified Reports" message="Retrieving reports ready for incident grouping.">
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
        </StateCard>
      ) : error ? (
        <StateCard title="Unable to Load Verified Reports" message={incidentGroupingErrorMessage(new Error(error))}>
          <ActionButton label="Retry" onPress={() => void reload()} />
        </StateCard>
      ) : reports.length === 0 ? (
        <StateCard title="No Verified Reports" message="Verify a report before reviewing possible incident relationships.">
          <ActionButton label="Refresh Reports" onPress={() => void reload()} />
        </StateCard>
      ) : (
        <View style={styles.list}>
          {reports.map((report) => (
            <View key={report.id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.reportIcon}>
                  <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="document-text-outline" size={18} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardEyebrow}>VERIFIED REPORT</Text>
                  <Text style={styles.cardTitle}>{report.hazardType.replace(/_/g, ' ')}</Text>
                </View>
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{report.description}</Text>
              <Text style={styles.detail}>Location: {formatIncidentLocation(report.location)}</Text>
              <ActionButton
                label="CHECK RELATED INCIDENTS"
                onPress={() => router.push({ pathname: '/officer/incidents/group', params: { reportId: report.id } })}
              />
            </View>
          ))}
        </View>
      )}
    </DashboardScreen>
  );
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
  description: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.muted },
  definitionCard: { gap: 7, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.primarySoft, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  definitionTitle: { fontSize: 17, fontWeight: '800', color: dashboardTheme.colors.text },
  definitionBody: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  list: { gap: 12 },
  reportCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reportIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: dashboardTheme.colors.primarySoft },
  cardCopy: { flex: 1, gap: 4 },
  cardEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, color: dashboardTheme.colors.muted },
  cardTitle: { fontSize: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  cardBody: { fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.text },
  detail: { fontSize: 14, lineHeight: 20, color: dashboardTheme.colors.muted },
  stateCard: { gap: 12, alignItems: 'center', padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  stateTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center', color: dashboardTheme.colors.text },
  stateBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: dashboardTheme.colors.muted },
  actionButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  actionButtonText: { fontSize: 14, fontWeight: '800', color: '#ffffff', textAlign: 'center' },
  pressed: { opacity: 0.65 }
});
