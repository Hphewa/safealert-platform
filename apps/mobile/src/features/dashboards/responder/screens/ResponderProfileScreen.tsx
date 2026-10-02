import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { responderConnectivity } from '../offline/responderOfflineRuntime';

export function ResponderProfileScreen() {
  const { user, logout } = useAuth();
  const connectivity = useSyncExternalStore(responderConnectivity.subscribe, responderConnectivity.getSnapshot, () => 'unknown' as const);
  const inFlight = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleLogout = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoggingOut(true);
    setError(null);
    try { await logout(); }
    catch { setError('Unable to finish logging out. Please try again.'); }
    finally { inFlight.current = false; setLoggingOut(false); }
  }, [logout]);

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems}>
      <DashboardHeader title="Responder Profile" />
      {user?.role === 'EMERGENCY_RESPONDER' ? (
        <View style={styles.card}>
          {/* Display only public profile fields; credentials and operational queue data stay private. */}
          <Text style={styles.label}>Name</Text><Text style={styles.value}>{user.name}</Text>
          <Text style={styles.label}>Email</Text><Text style={styles.value}>{user.email}</Text>
          <Text style={styles.label}>Role</Text><Text style={styles.value}>Emergency Responder</Text>
          <Text style={styles.label}>Connection</Text>
          <Text accessibilityLiveRegion="polite" style={styles.value}>
            {connectivity === 'online' ? 'Online' : connectivity === 'offline' ? 'Offline' : 'Checking connection'}
          </Text>
        </View>
      ) : <Text style={styles.value}>Your responder profile is unavailable. Please log in again.</Text>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out"
        disabled={loggingOut} accessibilityState={{ disabled: loggingOut, busy: loggingOut }}
        onPress={() => void handleLogout()} style={[styles.logoutButton, loggingOut && styles.disabled]}>
        {loggingOut ? <ActivityIndicator color={dashboardTheme.colors.critical} /> : null}
        <Text style={styles.logoutText}>{loggingOut ? 'Logging out...' : 'Log out'}</Text>
      </Pressable>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8, padding: 20, borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow
  },
  label: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.muted },
  value: { fontSize: 17, lineHeight: 24, color: dashboardTheme.colors.text },
  error: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.critical },
  logoutButton: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.criticalSoft
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: dashboardTheme.colors.critical },
  disabled: { opacity: 0.5 }
});
