import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ProfileImage } from '../../shared/components/ProfileImage';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { useResponderProfileActivity } from '../useResponderProfileActivity';

export function ResponderProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const activity = useResponderProfileActivity();
  const { offline } = activity;
  const isResponder = user?.role === 'EMERGENCY_RESPONDER';
  const pendingUpdates = isResponder ? offline.items.filter((item) => item.responderId === user.id).length : 0;
  const syncActionInFlight = useRef(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const [syncActionError, setSyncActionError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleLogout = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoggingOut(true);
    setError(null);
    // Shared auth clears credentials; the account's persistent offline updates must remain untouched here.
    try { await logout(); }
    catch { setError('Unable to finish logging out. Please try again.'); }
    finally { inFlight.current = false; setLoggingOut(false); }
  }, [logout]);

  const retrySavedUpdates = async (reload = false) => {
    if (syncActionInFlight.current || !isResponder || loggingOut) return;
    if (!reload && (offline.connectivity !== 'online' || offline.isSyncing || pendingUpdates === 0)) return;
    syncActionInFlight.current = true;
    setRetryingSync(true);
    setSyncActionError(null);
    try { await (reload ? offline.reload() : offline.retrySync()); }
    catch {
      if (offline.isCurrent()) setSyncActionError('Unable to retry saved updates. Please try again.');
    } finally {
      syncActionInFlight.current = false;
      if (offline.isCurrent()) setRetryingSync(false);
    }
  };

  const syncMessage = offline.status === 'loading' ? 'Checking saved updates...'
    : offline.status === 'error' ? 'Unable to read saved updates. They remain on this device.'
      : offline.isSyncing ? 'Synchronizing saved updates...'
        : pendingUpdates > 0 ? `${pendingUpdates} update${pendingUpdates === 1 ? '' : 's'} waiting to synchronize`
          : offline.syncError ? 'Synchronization needs attention.' : 'All responder updates synchronized';
  const lastSyncedAt = offline.lastSyncedAt && Number.isFinite(Date.parse(offline.lastSyncedAt))
    ? new Date(offline.lastSyncedAt).toLocaleString() : null;
  const retryDisabled = retryingSync || Boolean(offline.isSyncing) || loggingOut;
  const refreshDisabled = !activity.canRefresh || activity.refreshing || offline.connectivity === 'offline';

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems}>
      <DashboardHeader roleLabel="FIELD RESPONSE" accentColor={dashboardTheme.colors.high} title="Responder Profile" description="Your responder account, response activity and synchronization status." />
      {isResponder ? (
        <>
        <View style={styles.card}>
          <View style={styles.profileIdentity}><ProfileImage size={64} /><View><Text style={styles.value}>{user.name?.trim() || 'Responder'}</Text><Text style={styles.description}>Emergency responder</Text></View></View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>RESPONDER ACCOUNT</Text>
          <Text style={styles.label}>Name</Text><Text style={styles.value}>{user.name?.trim() || 'Not available'}</Text>
          <Text style={styles.label}>Email</Text><Text style={styles.value}>{user.email?.trim() || 'Not available'}</Text>
          <Text style={styles.label}>Role</Text><Text style={styles.value}>Emergency Responder</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>RESPONSE STATUS</Text>
          <Text style={styles.label}>Connection</Text>
          <View style={styles.connectionRow}>
            <View style={[styles.connectionDot, { backgroundColor: offline.connectivity === 'online' ? dashboardTheme.colors.success : dashboardTheme.colors.moderate }]} />
            <Text accessibilityLiveRegion="polite" style={styles.value}>
              {offline.connectivity === 'online' ? 'Online' : offline.connectivity === 'offline' ? 'Offline' : 'Checking connection'}
            </Text>
          </View>
          {offline.connectivity === 'offline' ? <Text style={styles.description}>Updates can be saved offline and synchronized when your connection returns.</Text> : null}
          <View style={styles.countRow}>
            <View style={styles.countItem}>
              <Text style={styles.label}>Active Assignments</Text>
              <Text style={styles.value}>{activity.loading ? 'Loading...' : activity.activeCount ?? 'Unavailable'}</Text>
            </View>
            <View style={styles.countItem}>
              <Text style={styles.label}>Available Requests</Text>
              <Text style={styles.value}>{activity.availableLoading ? 'Loading...' : activity.availableCount ?? 'Unavailable'}</Text>
            </View>
          </View>
          {offline.connectivity === 'offline' ? <Text style={styles.description}>Active assignments use previously loaded responses. Available requests require a connection.</Text> : null}
          {activity.error || activity.availableError ? <Text accessibilityRole="alert" style={styles.error}>{activity.error || activity.availableError}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh response counts"
            disabled={refreshDisabled}
            accessibilityState={{ disabled: refreshDisabled, busy: activity.refreshing }}
            onPress={() => void activity.refresh()} style={[styles.secondaryButton, refreshDisabled && styles.disabled]}>
            <Text style={styles.actionText}>{activity.refreshing ? 'Refreshing...' : activity.error || activity.availableError ? 'Retry response counts' : 'Refresh response counts'}</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>OFFLINE & SYNC</Text>
          {/* The existing account-scoped queue is authoritative; loading/error never masquerades as zero pending updates. */}
          <Text style={styles.label}>Pending offline updates</Text>
          <Text style={styles.value}>{offline.status === 'ready' ? pendingUpdates : offline.status === 'loading' ? 'Checking...' : 'Unavailable'}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.description}>{syncMessage}</Text>
          {lastSyncedAt ? <Text style={styles.description}>Last synchronized: {lastSyncedAt}</Text> : null}
          {offline.syncError ? <Text accessibilityRole="alert" style={styles.error}>Some updates could not synchronize. Retry when online.</Text> : null}
          {syncActionError ? <Text accessibilityRole="alert" style={styles.error}>{syncActionError}</Text> : null}
          {offline.status === 'error' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry reading saved updates" disabled={retryDisabled}
              accessibilityState={{ disabled: retryDisabled, busy: retryingSync }}
              onPress={() => void retrySavedUpdates(true)} style={[styles.secondaryButton, retryDisabled && styles.disabled]}>
              <Text style={styles.actionText}>Retry reading saved updates</Text>
            </Pressable>
          ) : pendingUpdates > 0 && offline.status === 'ready' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry Sync"
              disabled={retryDisabled || offline.connectivity !== 'online'}
              accessibilityState={{ disabled: retryDisabled || offline.connectivity !== 'online', busy: retryingSync }}
              onPress={() => void retrySavedUpdates()} style={[styles.secondaryButton, (retryDisabled || offline.connectivity !== 'online') && styles.disabled]}>
              <Text style={styles.actionText}>{retryingSync || offline.isSyncing ? 'Synchronizing...' : 'Retry Sync'}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>RESPONSE MANAGEMENT</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Active Responses" onPress={() => router.push('/responder/active')} style={styles.shortcut}>
            <Text style={styles.shortcutTitle}>Active Responses</Text>
            <Text style={styles.description}>Continue your currently assigned emergencies.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Response History" onPress={() => router.push('/responder/history')} style={styles.shortcut}>
            <Text style={styles.shortcutTitle}>Response History</Text>
            <Text style={styles.description}>View emergency responses you completed.</Text>
          </Pressable>
        </View>
        </>
      ) : <Text style={styles.value}>Your responder profile is unavailable. Please log in again.</Text>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {pendingUpdates > 0 ? <Text style={styles.description}>Saved updates remain on this device after logging out. Sign in with this account to synchronize them.</Text> : null}
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
  profileIdentity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 8 },
  label: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.muted },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.text },
  description: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionDot: { width: 9, height: 9, borderRadius: 5 },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 8 },
  countItem: { flexGrow: 1, flexBasis: 120, gap: 6 },
  secondaryButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  actionText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  shortcut: { gap: 4, minHeight: 64, padding: 14, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primarySoft },
  shortcutTitle: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  value: { fontSize: 17, lineHeight: 24, color: dashboardTheme.colors.text },
  error: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.critical },
  logoutButton: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.criticalSoft
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: dashboardTheme.colors.critical },
  disabled: { opacity: 0.5 }
});
