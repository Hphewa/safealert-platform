import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { FieldConfirmation } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VolunteerStateCard } from '../components/VolunteerStateCard';
import { volunteerBottomNavItems } from '../mockData';
import { listMyFieldConfirmations } from '../api/fieldConfirmationsApi';
import { apiBaseUrl } from '@/services/api/client';

export function VolunteerConfirmationsScreen() {
  const { accessToken } = useAuth();
  const [confirmations, setConfirmations] = useState<FieldConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setConfirmations([]);
    void (async () => {
      try {
        if (!accessToken) throw new Error('Your volunteer session is unavailable. Please log in again.');
        const response = await listMyFieldConfirmations(accessToken);
        if (active) setConfirmations(response.confirmations);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load confirmations.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, retry]));

  const confirmedCount = confirmations.filter((item) => item.outcome === 'CONFIRMED').length;

  return <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.page}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>VOLUNTEER ACTIVITY</Text>
      <Text accessibilityRole="header" style={styles.pageTitle}>My Confirmations</Text>
      <Text style={styles.subtitle}>Your field checks, all in one place. Track the confirmations and issues you have submitted for officer review.</Text>
      {!loading && !error ? <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{confirmations.length}</Text>
          <Text style={styles.summaryLabel}>Submitted</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, styles.confirmedText]}>{confirmedCount}</Text>
          <Text style={styles.summaryLabel}>Confirmed</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, styles.flagText]}>{confirmations.length - confirmedCount}</Text>
          <Text style={styles.summaryLabel}>Unable to confirm</Text>
        </View>
      </View> : null}
    </View>
    {!loading && !error && confirmations.length > 0 ? <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Submission history</Text>
      <Text style={styles.sectionHint}>Newest first</Text>
    </View> : null}
    {loading ? <VolunteerStateCard loading title="Loading Confirmations" message="Retrieving your submitted field checks." /> :
      error ? <VolunteerStateCard title="Unable to Load Confirmations" message={error} actionLabel="Retry" onActionPress={() => setRetry((value) => value + 1)} /> :
        confirmations.length === 0 ? <VolunteerStateCard title="No Confirmations Yet" message="Your submitted confirmations and flags will appear here." /> :
          confirmations.map((item) => {
            const isConfirmed = item.outcome === 'CONFIRMED';
            return <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.outcomeIcon, isConfirmed ? styles.confirmedBackground : styles.flagBackground]}>
                  <Text accessible={false} style={[styles.iconText, isConfirmed ? styles.confirmedText : styles.flagText]}>{isConfirmed ? '\u2713' : '!'}</Text>
                </View>
                <View style={styles.cardHeading}>
                  <Text style={styles.cardTitle}>{isConfirmed ? 'Current Situation Confirmed' : 'Unable to Confirm'}</Text>
                  <Text style={styles.cardSubtitle}>{isConfirmed ? 'Field confirmation submitted' : 'Issue flagged for officer review'}</Text>
                </View>
                <View style={styles.statusBadge} accessibilityLabel={`Review status: ${item.status}`}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              {item.outcome === 'UNABLE_TO_CONFIRM' ? <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>REASON FOR FLAG</Text>
                <Text style={styles.reasonText}>{item.reason}</Text>
                {item.reasonDetails ? <Text style={styles.reasonDetails}>{item.reasonDetails}</Text> : null}
              </View> : <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>CHECKLIST</Text>
                <Text style={styles.reasonText}>Location matches: {item.verificationChecklist.locationMatches ? 'Yes' : 'No'}</Text>
                <Text style={styles.reasonText}>Photo matches: {item.verificationChecklist.photoMatches ? 'Yes' : 'No'}</Text>
                <Text style={styles.reasonText}>Situation still exists: {item.verificationChecklist.situationStillExists ? 'Yes' : 'No'}</Text>
                <Text style={styles.reasonText}>Severity appears correct: {item.verificationChecklist.severityAppearsCorrect ? 'Yes' : 'No'}</Text>
                {item.observation ? <Text style={styles.reasonDetails}>{item.observation}</Text> : null}
                {item.mediaReference && resolveMediaUri(item.mediaReference) ? <Image accessibilityLabel="Field evidence" source={{ uri: resolveMediaUri(item.mediaReference)! }} style={styles.mediaPreview} /> : null}
              </View>}
              <View style={styles.cardFooter}>
                <View style={styles.metadata}>
                  <Text style={styles.metaLabel}>REPORT REFERENCE</Text>
                  <Text selectable style={styles.reportReference}>{item.reportId}</Text>
                </View>
                <View style={styles.metadata}>
                  <Text style={styles.metaLabel}>SUBMITTED</Text>
                  <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </View>
            </View>;
          })}
  </DashboardScreen>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingTop: 24, paddingBottom: 32, gap: 16 },
  hero: { backgroundColor: dashboardTheme.colors.primarySoft, borderRadius: dashboardTheme.radius.lg, padding: 24, gap: 10 },
  eyebrow: { color: dashboardTheme.colors.primaryStrong, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: dashboardTheme.colors.text, fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: '#475569', fontSize: 15, lineHeight: 23, maxWidth: 580 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  summaryItem: { flex: 1, minWidth: 110, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.sm, padding: 14, gap: 5 },
  summaryValue: { color: dashboardTheme.colors.primaryStrong, fontSize: 26, fontWeight: '800' },
  summaryLabel: { color: '#475569', fontSize: 12, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingHorizontal: 4 },
  sectionTitle: { color: dashboardTheme.colors.text, fontSize: 18, fontWeight: '700' },
  sectionHint: { color: dashboardTheme.colors.muted, fontSize: 12 },
  card: { backgroundColor: dashboardTheme.colors.surface, padding: 20, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border, gap: 18, ...cardShadow },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  outcomeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 25, fontWeight: '700' },
  confirmedBackground: { backgroundColor: dashboardTheme.colors.successSoft },
  flagBackground: { backgroundColor: dashboardTheme.colors.moderateSoft },
  confirmedText: { color: '#166534' },
  flagText: { color: '#9a3412' },
  cardHeading: { flex: 1, minWidth: 150, gap: 5 },
  cardTitle: { color: dashboardTheme.colors.text, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  cardSubtitle: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 19 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#fef3c7', borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#92400e' },
  statusText: { color: '#92400e', fontSize: 10, letterSpacing: 0.6, fontWeight: '800' },
  reasonBox: { backgroundColor: '#fff7ed', borderLeftWidth: 3, borderLeftColor: dashboardTheme.colors.moderate, borderRadius: 10, padding: 14, gap: 6 },
  reasonLabel: { color: '#9a3412', fontSize: 10, letterSpacing: 1, fontWeight: '800' },
  reasonText: { color: dashboardTheme.colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  reasonDetails: { color: '#475569', fontSize: 14, lineHeight: 21 },
  mediaPreview: { width: '100%', height: 160, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted, marginTop: 8 },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border, paddingTop: 14 },
  metadata: { flexGrow: 1, flexShrink: 1, gap: 5 },
  metaLabel: { color: dashboardTheme.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  reportReference: { color: '#475569', fontSize: 12, lineHeight: 18 },
  dateText: { color: '#475569', fontSize: 12, lineHeight: 18 }
});

function resolveMediaUri(mediaReference: string) {
  if (/^(https?:|data:image\/)/i.test(mediaReference)) return mediaReference;
  if (mediaReference.startsWith('/')) return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '')}${mediaReference}`;
  return undefined;
}
