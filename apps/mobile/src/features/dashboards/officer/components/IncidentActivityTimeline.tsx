import { StyleSheet, Text, View } from 'react-native';
import type { RiskActivityEvent } from '@safealert/contracts';
import { dashboardTheme } from '../../shared/theme';
import { formatOperationalTime } from '../../shared/formatOperationalTime';
import { AssessmentButton, assessmentStyles } from './RiskAssessmentComponents';

export function IncidentActivityTimeline({ events, loading, error, onRetry }: {
  events: RiskActivityEvent[]; loading: boolean; error: string | null; onRetry: () => void;
}) {
  return <View style={styles.section}>
    <Text style={assessmentStyles.heading}>Incident Activity</Text>
    <Text style={assessmentStyles.helper}>Recorded events for this incident, newest first.</Text>
    {loading ? <Text accessibilityRole="progressbar" style={assessmentStyles.helper}>Loading incident activity…</Text> : null}
    {error ? <><Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text><AssessmentButton label="Retry activity" secondary onPress={onRetry} /></> : null}
    {!loading && !error && events.length === 0 ? <Text style={assessmentStyles.helper}>No incident activity is available.</Text> : null}
    {!loading && !error ? events.map((event) => <View key={event.id} style={styles.event}>
      <Text style={styles.eventTitle}>{event.title}</Text>
      {event.description ? <Text style={assessmentStyles.body}>{event.description}</Text> : null}
      <Text style={assessmentStyles.helper}>{formatOperationalTime(event.timestamp)}</Text>
    </View>) : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  event: { borderLeftWidth: 2, borderLeftColor: dashboardTheme.colors.primary, paddingLeft: 12, paddingVertical: 7, gap: 3 },
  eventTitle: { color: dashboardTheme.colors.text, fontSize: 15, fontWeight: '700' }
});
