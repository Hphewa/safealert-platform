import type { SafeResponseRequest } from '@safealert/contracts';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { cardShadow, dashboardTheme } from '../../shared/theme';
import { presentResidentEmergencyRequest } from '../emergencyRequestPresentation';
import { residentEmergencyRequestDetailsHref } from '../emergencyRequestNavigation';

type EmergencyRequestSummaryCardProps = {
  request: SafeResponseRequest;
};

export function EmergencyRequestSummaryCard({ request }: EmergencyRequestSummaryCardProps) {
  const router = useRouter();
  const summary = presentResidentEmergencyRequest(request);
  const href = residentEmergencyRequestDetailsHref(request.id);

  return (
    <Pressable
      accessible
      accessibilityRole={href ? 'button' : undefined}
      accessibilityHint={href ? 'View emergency request details' : undefined}
      accessibilityState={{ disabled: !href }}
      disabled={!href}
      accessibilityLabel={`${summary.assistanceType}. Submitted: ${summary.submittedAt}. Status: ${summary.status}.`}
      onPress={() => {
        // Only the ID travels through navigation; details and ownership come from the secure API.
        if (href) router.push(href);
      }}
      style={({ pressed }) => [styles.card, pressed && href && styles.pressed]}
    >
      <Text style={styles.title}>{summary.assistanceType}</Text>
      <Text style={styles.submittedAt}>Submitted: {summary.submittedAt}</Text>
      <Text style={styles.status}>Status: {summary.status}</Text>
      {href ? <Text style={styles.action}>View Details</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },
  action: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
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
