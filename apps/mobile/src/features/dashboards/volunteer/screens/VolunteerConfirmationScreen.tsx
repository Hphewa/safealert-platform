import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FIELD_CONFIRMATION_REASON_MAX_LENGTH, UNABLE_TO_CONFIRM_REASONS, type CreateFieldConfirmationRequest, type FieldConfirmation, type UnableToConfirmReason } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { VolunteerStateCard } from '../components/VolunteerStateCard';
import { volunteerBottomNavItems } from '../mockData';
import { getCommunityReportById } from '../api/communityReportsApi';
import { submitFieldConfirmation } from '../api/fieldConfirmationsApi';
import { buildConfirmationInput } from '../confirmation';
import { mapCommunityReportToVolunteerReport, type VolunteerCommunityReport } from '../reports';

export function VolunteerConfirmationScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const [report, setReport] = useState<VolunteerCommunityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<CreateFieldConfirmationRequest['outcome'] | null>(null);
  const [reason, setReason] = useState<UnableToConfirmReason | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FieldConfirmation | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useFocusEffect(useCallback(() => {
    const current = ++generation.current;
    setLoading(true); setReport(null); setError(null); setResult(null); setOutcome(null); setReason(''); setDetails('');
    void (async () => {
      try {
        if (!reportId || !accessToken) throw new Error('Report or volunteer session is unavailable.');
        const response = await getCommunityReportById(reportId, accessToken);
        if (current === generation.current) setReport(mapCommunityReportToVolunteerReport(response.report));
      } catch (cause) {
        if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Unable to load report.');
      } finally {
        if (current === generation.current) setLoading(false);
      }
    })();
    return () => { generation.current += 1; };
  }, [reportId, accessToken, retry]));

  async function submit() {
    if (inFlight.current || !report || !reportId || !accessToken || !outcome || result) return;
    const current = generation.current;
    try {
      const input = buildConfirmationInput(outcome, reason, details);
      inFlight.current = true; setSubmitting(true); setError(null);
      const response = await submitFieldConfirmation(reportId, input, accessToken);
      if (current === generation.current) setResult(response.confirmation);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Unable to submit. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return <DashboardScreen bottomNavItems={volunteerBottomNavItems}>
    <Text style={styles.title}>Review & Confirm</Text>
    <Pressable accessibilityRole="button" disabled={submitting} onPress={() => router.back()}><Text style={styles.link}>Back to Report</Text></Pressable>
    {loading ? <VolunteerStateCard loading title="Loading Report" message="Retrieving current report information." /> : result ?
      <VolunteerStateCard icon="checkmark-circle-outline" title={result.outcome === 'CONFIRMED' ? 'Confirmation Submitted' : 'Unable to Confirm Submitted'}
        message={`Status: ${result.status}. Available for Disaster Officer review. Submitted ${new Date(result.createdAt).toLocaleString()}.`}
        actionLabel="Back to Reports" onActionPress={() => router.replace('/volunteer/nearby')} /> : !report ?
      <VolunteerStateCard title="Report Unavailable" message={error ?? 'This report cannot be reviewed.'} actionLabel="Retry" onActionPress={() => setRetry((value) => value + 1)} /> : <>
      <View style={styles.card}>
        <Text style={styles.title}>{report.hazardType}</Text>
        <Text style={styles.text}>{report.locationLabel}</Text>
        <Text style={styles.text}>{report.reportedDateTimeLabel} · {report.severity} · {report.status}</Text>
        <Text style={styles.text}>{report.description}</Text>
        {report.mediaUrl ? <Image source={{ uri: report.mediaUrl }} accessibilityLabel="Resident report photo" style={styles.photo} /> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Can you confirm the situation?</Text>
        {(['CONFIRMED', 'UNABLE_TO_CONFIRM'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: outcome === value, disabled: submitting }} disabled={submitting}
          onPress={() => { setOutcome(value); setError(null); }} style={[styles.choice, outcome === value && styles.selected]}>
          <Text style={styles.text}>{value === 'CONFIRMED' ? 'Confirm Current Situation' : 'Unable to Confirm / Flag Issue'}</Text>
        </Pressable>)}
        {outcome === 'UNABLE_TO_CONFIRM' ? <>
          <Text style={styles.text}>Reason (required)</Text>
          {UNABLE_TO_CONFIRM_REASONS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value, disabled: submitting }} disabled={submitting}
            onPress={() => { setReason(value); setError(null); }} style={[styles.choice, reason === value && styles.selected]}><Text style={styles.text}>{value}</Text></Pressable>)}
          {reason === 'Other' ? <TextInput accessibilityLabel="Reason details (required)" editable={!submitting} multiline maxLength={FIELD_CONFIRMATION_REASON_MAX_LENGTH}
            placeholder="Describe why you cannot confirm" value={details} onChangeText={setDetails} style={styles.choice} /> : null}
        </> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting || !outcome }} disabled={submitting || !outcome} onPress={() => void submit()} style={[styles.button, (submitting || !outcome) && styles.disabled]}>
          <Text style={styles.buttonText}>{submitting ? 'Submitting…' : outcome === 'UNABLE_TO_CONFIRM' ? 'Submit Flag' : 'Submit Confirmation'}</Text>
        </Pressable>
      </View>
    </>}
  </DashboardScreen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: dashboardTheme.colors.text },
  text: { color: dashboardTheme.colors.text, fontSize: 15, lineHeight: 23 },
  link: { color: dashboardTheme.colors.primary, paddingVertical: 12 },
  card: { padding: 20, gap: 14, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md },
  choice: { padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, color: dashboardTheme.colors.text },
  selected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  button: { padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  buttonText: { color: '#ffffff', textAlign: 'center', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: dashboardTheme.colors.critical },
  photo: { width: '100%', height: 180, borderRadius: dashboardTheme.radius.sm }
});
