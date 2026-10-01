import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoredRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftStorage';
import { dashboardTheme } from '../../shared/theme';
import { formatOperationalTime } from '../../shared/formatOperationalTime';

export function AssessmentDraftRecovery({ loading, draft, busy, error, onContinue, onStartAgain }: {
  loading: boolean;
  draft: StoredRiskAssessmentDraft | null;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
  onStartAgain: () => void;
}) {
  if (!loading && !draft) return null;
  const title = loading ? 'Checking saved assessment' : 'Continue your assessment?';
  return <View accessibilityViewIsModal style={styles.backdrop}>
    <View accessibilityRole="alert" style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Checking saved assessment" color={dashboardTheme.colors.primary} /> : <>
        <Text style={styles.body}>An unfinished {draft!.mode === 'INITIAL' ? 'risk assessment' : 'reassessment'} is saved on this device.</Text>
        <Text style={styles.helper}>Saved {formatOperationalTime(draft!.updatedAt)}. Current incident eligibility will be checked before continuing.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={onContinue} style={[styles.button, styles.primary]}>
          <Text style={styles.primaryText}>{busy ? 'Checking…' : 'Continue'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onStartAgain} style={styles.button}>
          <Text style={styles.buttonText}>Start again</Text>
        </Pressable>
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', zIndex: 1000, top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.58)' },
  card: { width: '100%', maxWidth: 480, padding: 22, borderRadius: 18, gap: 14, backgroundColor: dashboardTheme.colors.surface },
  title: { color: dashboardTheme.colors.text, fontSize: 21, fontWeight: '800' },
  body: { color: dashboardTheme.colors.text, fontSize: 16, lineHeight: 23 },
  helper: { color: dashboardTheme.colors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: dashboardTheme.colors.critical, fontSize: 14 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1,
    borderColor: dashboardTheme.colors.border, paddingHorizontal: 16 },
  primary: { backgroundColor: dashboardTheme.colors.primary, borderColor: dashboardTheme.colors.primary },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonText: { color: dashboardTheme.colors.text, fontWeight: '700', fontSize: 15 }
});
