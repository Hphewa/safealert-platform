import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import {
  accessConditionLabels,
  emergencyAssistanceTypeLabels,
  useEmergencyAssistanceDraft
} from '../emergencyAssistanceDraft';
import { residentBottomNavItems } from '../mockData';

export function EmergencyRequestSubmittedScreen() {
  const router = useRouter();
  const { submittedResponseRequest } = useEmergencyAssistanceDraft();
  const submittedStatus = submittedResponseRequest?.status ?? 'Unavailable';
  const requestReference = submittedResponseRequest
    ? formatRequestReference(submittedResponseRequest.id)
    : null;

  const trackRequest = () => {
    // Emergency assistance requests use a separate tracking flow from resident hazard reports.
    router.push('/resident/my-emergency-requests');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Request Submitted</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.successPanel}>
        <View style={styles.successIcon}>
          <DashboardGlyph color={dashboardTheme.colors.success} name="checkmark-done-outline" size={24} />
        </View>
        <Text style={styles.successTitle}>Emergency Request Submitted Successfully!</Text>
        <Text style={styles.successText}>Your request has been received.</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={styles.statusValue}>{submittedStatus}</Text>
      </View>

      {submittedResponseRequest ? (
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>Confirmed request details</Text>
          {requestReference ? <SubmittedDetail label="Reference" value={requestReference} /> : null}
          <SubmittedDetail label="Request ID" value={submittedResponseRequest.id} />
          <SubmittedDetail
            label="Assistance Type"
            value={emergencyAssistanceTypeLabels[submittedResponseRequest.assistanceType]}
          />
          <SubmittedDetail
            label="Road / Access"
            value={accessConditionLabels[submittedResponseRequest.roadAccessibility]}
          />
          <SubmittedDetail
            label="Coordinates"
            value={
              Array.isArray(submittedResponseRequest.location?.coordinates) &&
              submittedResponseRequest.location.coordinates.length === 2 &&
              Number.isFinite(submittedResponseRequest.location.coordinates[1]) &&
              Number.isFinite(submittedResponseRequest.location.coordinates[0])
                ? `${submittedResponseRequest.location.coordinates[1].toFixed(6)}, ${submittedResponseRequest.location.coordinates[0].toFixed(6)}`
                : 'Not provided'
            }
          />
        </View>
      ) : (
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>Confirmed request details</Text>
          <Text style={styles.helperText}>
            No confirmed emergency request details are available in this session.
          </Text>
        </View>
      )}

      <View style={styles.confirmationPanel}>
        <View style={styles.connectionDot} />
        <Text style={styles.helperText}>
          {submittedResponseRequest
            ? `Confirmed by SafeAlert with backend status ${submittedResponseRequest.status}.`
            : 'Open My Emergency Requests to view your submitted emergency assistance requests.'}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Track emergency request"
          accessibilityRole="button"
          onPress={trackRequest}
          style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}
        >
          <Text style={styles.trackButtonText}>Track Request</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Return to resident dashboard"
          accessibilityRole="button"
          onPress={() => router.push('/resident')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

function SubmittedDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatRequestReference(id: string) {
  return `REQ-${id.slice(0, 8).toUpperCase()}`;
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  successPanel: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  successIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: dashboardTheme.colors.successSoft
  },
  successTitle: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  statusCard: {
    gap: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.moderate,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.moderateSoft,
    ...cardShadow
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.moderate
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  summaryPanel: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  detailRow: {
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  helperText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  confirmationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dashboardTheme.colors.success
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  trackButton: {
    flexGrow: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  trackButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  primaryButton: {
    flexGrow: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
