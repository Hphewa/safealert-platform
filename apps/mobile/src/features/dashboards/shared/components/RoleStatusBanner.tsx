import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { dashboardTheme } from '../theme';
import type { DashboardIconName } from '../types';

type RoleStatusBannerProps = {
  title: string;
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'critical';
  icon?: DashboardIconName;
  actionLabel?: string;
  onAction?: () => void;
};

const tones = {
  info: { color: dashboardTheme.colors.primaryStrong, background: dashboardTheme.colors.primarySoft },
  success: { color: dashboardTheme.colors.success, background: dashboardTheme.colors.successSoft },
  warning: { color: dashboardTheme.colors.high, background: dashboardTheme.colors.highSoft },
  critical: { color: dashboardTheme.colors.critical, background: dashboardTheme.colors.criticalSoft }
} as const;

export function RoleStatusBanner({ title, message, tone = 'info', icon = 'information-circle-outline', actionLabel, onAction }: RoleStatusBannerProps) {
  const colors = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: colors.background, borderColor: colors.color }]}>
      <View style={[styles.icon, { backgroundColor: colors.color }]}><DashboardGlyph color="#ffffff" name={icon} size={17} /></View>
      <View style={styles.copy}><Text style={[styles.title, { color: colors.color }]}>{title}</Text><Text style={styles.message}>{message}</Text></View>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={[styles.action, { color: colors.color }]}>{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderLeftWidth: 4, borderRadius: 14 },
  icon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '900' },
  message: { fontSize: 12, lineHeight: 17, color: dashboardTheme.colors.text },
  action: { fontSize: 12, fontWeight: '900' }
});
