import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { cardShadow, dashboardTheme } from '../../shared/theme';

type EmergencyRequestStatePanelProps = {
  title: string;
  message?: string;
  loading?: boolean;
  onRetry?: () => void;
};

export function EmergencyRequestStatePanel({ title, message, loading = false, onRetry }: EmergencyRequestStatePanelProps) {
  return (
    <View style={styles.panel}>
      <View accessible accessibilityLiveRegion="polite" accessibilityState={{ busy: loading }} style={styles.content}>
        {loading ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : null}
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {onRetry && !loading ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  content: { gap: 10 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: dashboardTheme.colors.text },
  message: { fontSize: 16, lineHeight: 24, color: dashboardTheme.colors.muted },
  retryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  retryText: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.surface },
  pressed: { opacity: 0.82 }
});
