import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { cardShadow, dashboardTheme } from '../../shared/theme';

type VolunteerStateCardProps = {
  title: string;
  message: string;
  icon?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  loading?: boolean;
};

export function VolunteerStateCard({
  title,
  message,
  icon = 'help-circle-outline',
  actionLabel,
  onActionPress,
  loading = false
}: VolunteerStateCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        {loading ? (
          <ActivityIndicator color={dashboardTheme.colors.info} size="small" />
        ) : (
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={icon} size={20} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  body: {
    gap: 8
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  actionButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
