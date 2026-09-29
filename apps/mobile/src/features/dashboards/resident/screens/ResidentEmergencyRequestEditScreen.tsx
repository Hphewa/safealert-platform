import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { residentEmergencyRequestDetailsHref } from '../emergencyRequestNavigation';
import { residentEmergencyRequestEditUnavailableMessage } from '../emergencyRequestPresentation';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequestDetails } from '../useMyEmergencyRequestDetails';

export function ResidentEmergencyRequestEditScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string | string[] }>();
  // Direct links and acceptance during navigation need the same fresh, owner-scoped
  // read as Details. This shell deliberately has no form or update operation yet.
  const { request, error, refetch, isRefreshing, canRefetch } = useMyEmergencyRequestDetails(requestId);
  const unavailableMessage = request ? residentEmergencyRequestEditUnavailableMessage(request.status) : null;

  const returnToDetails = () => {
    if (router.canGoBack()) router.back();
    else router.replace(residentEmergencyRequestDetailsHref(requestId) ?? '/resident/my-emergency-requests');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <Text accessibilityRole="header" style={styles.title}>Edit Request</Text>
      {request ? (
        <EmergencyRequestStatePanel
          title={unavailableMessage ? 'Editing unavailable' : 'Editing is coming soon'}
          message={unavailableMessage ?? 'You will be able to update your request here. No changes have been made.'}
        />
      ) : (
        <EmergencyRequestStatePanel
          title={error ? 'Unable to open request' : 'Loading your emergency request...'}
          message={error ?? undefined}
          loading={isRefreshing}
          onRetry={error && canRefetch ? () => void refetch() : undefined}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Request Details"
        onPress={returnToDetails}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backButtonText}>Back to Request Details</Text>
      </Pressable>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: dashboardTheme.colors.text },
  backButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12,
    borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary
  },
  backButtonText: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: dashboardTheme.colors.surface },
  pressed: { opacity: 0.82 }
});
