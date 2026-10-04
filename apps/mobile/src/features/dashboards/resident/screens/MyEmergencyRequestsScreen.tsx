import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { EmergencyRequestSummaryCard } from '../components/EmergencyRequestSummaryCard';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequests } from '../useMyEmergencyRequests';

export function MyEmergencyRequestsScreen() {
  const router = useRouter();
  const { requests, error, refetch, isRefreshing, canRefetch } = useMyEmergencyRequests();

  const goBack = () => {
    // Direct links may have no history; return those residents to Emergency Assistance.
    if (router.canGoBack()) router.back();
    else router.replace('/resident/help');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>My Emergency Requests</Text>
        <Pressable
          accessibilityLabel="Refresh emergency requests"
          accessibilityRole="button"
          accessibilityState={{ disabled: isRefreshing || !canRefetch, busy: isRefreshing }}
          disabled={isRefreshing || !canRefetch}
          onPress={() => void refetch()}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <Text style={styles.description}>Track the progress of your emergency assistance requests. Completed and cancelled requests remain available here.</Text>
      {isRefreshing ? (
        <EmergencyRequestStatePanel title="Loading your emergency requests..." loading />
      ) : error ? (
        <EmergencyRequestStatePanel
          title="Unable to load requests"
          message={error}
          onRetry={canRefetch ? () => void refetch() : undefined}
        />
      ) : requests?.length === 0 ? (
        <EmergencyRequestStatePanel
          title="You have no emergency assistance requests yet."
          message="Your submitted emergency assistance requests will appear here."
        />
      ) : requests ? (
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {`${requests.length} emergency assistance ${requests.length === 1 ? 'request' : 'requests'} submitted.`}
        </Text>
      ) : null}
      {/* Terminal requests are Resident history; unlike responder active queues,
          this list keeps all server results in their original order. */}
      {!error && requests?.map((request, index) => (
        <EmergencyRequestSummaryCard
          key={typeof request.id === 'string' && request.id.trim() ? request.id : `missing-id-${index}`}
          request={request}
        />
      ))}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
