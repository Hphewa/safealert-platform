import type { SafeResponseRequest } from '@safealert/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, dashboardTheme } from '../../shared/theme';
import { presentResidentEmergencyRequest } from '../emergencyRequestPresentation';

type EmergencyRequestSummaryCardProps = {
  request: SafeResponseRequest;
};

export function EmergencyRequestSummaryCard({ request }: EmergencyRequestSummaryCardProps) {
  const summary = presentResidentEmergencyRequest(request);

  return (
    <View
      accessible
      accessibilityLabel={`${summary.assistanceType}. Submitted: ${summary.submittedAt}. Status: ${summary.status}.`}
      style={styles.card}
    >
      <Text style={styles.title}>{summary.assistanceType}</Text>
      <Text style={styles.submittedAt}>Submitted: {summary.submittedAt}</Text>
      <Text style={styles.status}>Status: {summary.status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  submittedAt: {
    fontSize: 14,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  status: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  }
});
