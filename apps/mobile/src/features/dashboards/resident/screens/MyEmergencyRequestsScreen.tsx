import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { dashboardTheme } from '../../shared/theme';
import { EmergencyRequestSummaryCard } from '../components/EmergencyRequestSummaryCard';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequests } from '../useMyEmergencyRequests';

export function MyEmergencyRequestsScreen() {
  const router = useRouter();
  const { requests, error } = useMyEmergencyRequests();

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
      </View>
      <Text style={styles.description}>Track the progress of your emergency assistance requests.</Text>
      <Text accessibilityLiveRegion="polite" style={styles.description}>
        {error ?? (requests === null
          ? 'Loading your emergency requests…'
          : requests.length === 0
            ? 'You have no emergency assistance requests yet.'
            : `${requests.length} emergency assistance ${requests.length === 1 ? 'request' : 'requests'} submitted.`)}
      </Text>
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
