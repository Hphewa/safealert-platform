import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { EmergencyRequestProgressTracker } from '../components/EmergencyRequestProgressTracker';
import { EmergencyRequestCancellationDialog } from '../components/EmergencyRequestCancellationDialog';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { presentResidentEmergencyRequestDetails } from '../emergencyRequestPresentation';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequestDetails } from '../useMyEmergencyRequestDetails';

export function ResidentEmergencyRequestDetailsScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string | string[] }>();
  const {
    request, error, refetch, isRefreshing, canRefetch, canCancelRequest, cancellationFeedback,
    isConfirmationOpen, isCancelling, openCancellationConfirmation, keepRequest, confirmCancellation
  } = useMyEmergencyRequestDetails(requestId);
  const details = request ? presentResidentEmergencyRequestDetails(request) : null;

  const goBack = () => {
    // A direct link may have no previous screen in the Resident stack.
    if (router.canGoBack()) router.back();
    else router.replace('/resident/my-emergency-requests');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Emergency Request Details</Text>
        <Pressable
          accessibilityLabel="Refresh emergency request details"
          accessibilityRole="button"
          accessibilityState={{ disabled: isRefreshing || !canRefetch, busy: isRefreshing }}
          disabled={isRefreshing || !canRefetch}
          onPress={() => void refetch()}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      {details ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.status}>Status: {details.status}</Text>
          </View>
          {request ? <EmergencyRequestProgressTracker status={request.status} /> : null}
          {details.sections.map((section) => (
            <View key={section.title} style={styles.panel}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
              {section.fields.map((field) => (
                <View key={field.label} style={styles.field}>
                  <Text style={styles.label}>{field.label}</Text>
                  <Text style={styles.value}>{field.value}</Text>
                </View>
              ))}
            </View>
          ))}
          {cancellationFeedback ? (
            <Text
              accessible
              accessibilityLiveRegion="polite"
              style={[styles.feedback, cancellationFeedback.kind === 'success' ? styles.successFeedback : styles.errorFeedback]}
            >
              {cancellationFeedback.message}
            </Text>
          ) : null}
          {canCancelRequest ? (
            <View style={styles.cancelAction}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel Request"
                accessibilityHint="Opens a confirmation before cancelling your request."
                disabled={isConfirmationOpen}
                accessibilityState={{ disabled: isConfirmationOpen }}
                onPress={openCancellationConfirmation}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelButtonText}>Cancel Request</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <EmergencyRequestStatePanel
          title={error ? 'Unable to load request details' : 'Loading your emergency request details...'}
          message={cancellationFeedback?.message ?? error ?? undefined}
          loading={isRefreshing}
          onRetry={error && canRefetch ? () => void refetch() : undefined}
        />
      )}
      {isConfirmationOpen ? (
        <EmergencyRequestCancellationDialog
          isSubmitting={isCancelling}
          onKeepRequest={keepRequest}
          onConfirm={() => void confirmCancellation()}
        />
      ) : null}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  feedback: { padding: 16, borderRadius: dashboardTheme.radius.sm, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  successFeedback: { backgroundColor: dashboardTheme.colors.successSoft, color: dashboardTheme.colors.text },
  errorFeedback: { backgroundColor: dashboardTheme.colors.criticalSoft, color: dashboardTheme.colors.text },
  cancelAction: { gap: 12 },
  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.critical,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  cancelButtonText: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: dashboardTheme.colors.critical },
  refreshButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  refreshText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface
  },
  title: { flex: 1, fontSize: 24, fontWeight: '800', color: dashboardTheme.colors.text },
  panel: {
    gap: 16, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  status: { fontSize: 20, lineHeight: 28, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: dashboardTheme.colors.text },
  field: { gap: 4 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: dashboardTheme.colors.muted },
  value: { fontSize: 16, lineHeight: 24, color: dashboardTheme.colors.text },
  pressed: { opacity: 0.82 }
});
