import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dashboardTheme } from '../../shared/theme';
import type { Connectivity } from './connectivity';
import type { QueueSnapshot } from './responderUpdateQueue';

export function ResponderOfflineStatus({ connectivity, items, status, error, reload }: QueueSnapshot & {
  connectivity: Connectivity;
  reload: () => Promise<void>;
}) {
  if (connectivity === 'online' && !items.length && status === 'ready') return null;
  return (
    <View style={styles.card}>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {connectivity === 'offline' ? "You're offline. Updates will be saved on this device."
          : connectivity === 'unknown' ? 'Connection not confirmed. Updates will be saved on this device.'
            : 'Online'}
        {status === 'loading' ? ' Checking saved updates...' : ''}
        {items.length ? ` ${items.length} update${items.length === 1 ? '' : 's'} pending sync. Saved on this device only; synchronization is not available yet.` : ''}
      </Text>
      {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
      {status === 'error' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry reading saved updates" onPress={() => void reload()} style={styles.retry}>
          <Text style={styles.text}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 12, gap: 8, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.moderateSoft },
  text: { color: dashboardTheme.colors.text, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 12 }
});
