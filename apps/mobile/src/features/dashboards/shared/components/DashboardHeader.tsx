import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { DashboardGlyph } from './DashboardGlyph';
import { dashboardTheme } from '../theme';
import type { DashboardIconName } from '../types';

type DashboardHeaderProps = {
  title: string;
  subtitle?: string;
  description?: string;
  titleAlign?: 'left' | 'center';
  trailingIcon?: DashboardIconName;
  trailingBadgeCount?: number;
  onTrailingPress?: () => void;
  showLogoutButton?: boolean;
};

export function DashboardHeader({
  title,
  subtitle,
  description,
  titleAlign = 'left',
  trailingIcon,
  trailingBadgeCount,
  onTrailingPress,
  showLogoutButton = false
}: DashboardHeaderProps) {
  const { logout } = useAuth();
  const headerTextAlign = titleAlign === 'center' ? 'center' : 'left';

  return (
    <View style={styles.wrapper}>
      <View style={[styles.topRow, titleAlign === 'center' && styles.topRowCenter]}>
        <Text style={[styles.title, { textAlign: headerTextAlign }]}>{title}</Text>
        {trailingIcon ? (
          <Pressable
            accessibilityRole="button"
            onPress={onTrailingPress}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.text} name={trailingIcon} size={18} />
            {typeof trailingBadgeCount === 'number' && trailingBadgeCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{trailingBadgeCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {showLogoutButton ? (
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void logout();
            }}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.critical} name="log-out-outline" size={16} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  topRowCenter: {
    paddingLeft: 44
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  subtitle: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: dashboardTheme.colors.muted
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surface
  },
  iconButtonPressed: {
    opacity: 0.82
  },
  iconSpacer: {
    width: 44,
    height: 44
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#f0c6c1',
    borderRadius: 999,
    backgroundColor: '#fff5f4'
  },
  logoutButtonPressed: {
    opacity: 0.82
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.critical
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff'
  }
});
