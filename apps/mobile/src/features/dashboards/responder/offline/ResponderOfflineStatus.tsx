import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { dashboardTheme } from '../../shared/theme';
import type { Connectivity } from './connectivity';
import type { QueueSnapshot } from './responderUpdateQueue';
import type { SyncStatus } from './responderSyncService';

export type ResponderOfflineStatusProps = QueueSnapshot & {
  connectivity: Connectivity;
  reload: () => Promise<void>;
  isSyncing?: boolean;
  syncStatus?: SyncStatus;
  syncError?: string | null;
  retrySync?: () => Promise<void>;
};

export function ResponderOfflineStatus({
  connectivity,
  items,
  status,
  error,
  reload,
  isSyncing,
  syncStatus,
  syncError,
  retrySync
}: ResponderOfflineStatusProps) {
  // Hide indicator when fully online, idle with no pending sync items or active errors
  if (
    connectivity === 'online' &&
    !items.length &&
    status === 'ready' &&
    !isSyncing &&
    syncStatus !== 'success' &&
    !error &&
    !syncError
  ) {
    return null;
  }

  // Construct primary user-facing banner message based on connectivity and synchronization lifecycle
  const renderStatusMessage = () => {
    if (isSyncing || syncStatus === 'syncing') {
      return 'Connection restored. Syncing saved updates…';
    }

    if (syncStatus === 'paused') {
      return 'Sync paused. We’ll retry when the connection is available.';
    }

    if (syncStatus === 'success' && !items.length) {
      return 'Saved updates synced.';
    }

    if (connectivity === 'offline') {
      return "You're offline. Updates will be saved on this device.";
    }

    if (connectivity === 'unknown') {
      return 'Connection not confirmed. Updates will be saved on this device.';
    }

    return 'Online';
  };

  const statusText = renderStatusMessage();
  const checkingText = status === 'loading' ? ' Checking saved updates...' : '';
  const pendingCountText = items.length
    ? ` ${items.length} update${items.length === 1 ? '' : 's'} pending sync.`
    : '';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {isSyncing ? (
          <ActivityIndicator
            size="small"
            color={dashboardTheme.colors.primaryStrong}
            accessibilityLabel="Syncing updates"
          />
        ) : null}
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {statusText}
          {checkingText}
          {pendingCountText}
        </Text>
      </View>

      {/* Storage load/save errors */}
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {/* Backend synchronization errors */}
      {syncError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {syncError}
        </Text>
      ) : null}

      {/* Action button: Retry reading from storage if local queue errored */}
      {status === 'error' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry reading saved updates"
          onPress={() => void reload()}
          style={styles.retry}
        >
          <Text style={styles.actionText}>Retry</Text>
        </Pressable>
      ) : null}

      {/* Action button: Retry synchronization if server sync errored or paused */}
      {retrySync && (syncStatus === 'error' || Boolean(syncError)) && status !== 'error' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry syncing saved updates"
          onPress={() => void retrySync()}
          style={styles.retry}
        >
          <Text style={styles.actionText}>Retry Sync</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    gap: 8,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.moderateSoft
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  text: {
    color: dashboardTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1
  },
  errorText: {
    color: dashboardTheme.colors.critical,
    fontSize: 13,
    lineHeight: 18
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12
  },
  actionText: {
    color: dashboardTheme.colors.primaryStrong ?? '#0284c7',
    fontSize: 14,
    fontWeight: '600'
  }
});
