import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { DashboardGlyph } from './DashboardGlyph';
import { ProfileImage } from './ProfileImage';
import { dashboardTheme } from '../theme';
import type { DashboardIconName } from '../types';

type DashboardHeaderProps = {
  title: string;
  subtitle?: string;
  description?: string;
  roleLabel?: string;
  accentColor?: string;
  titleAlign?: 'left' | 'center';
  trailingIcon?: DashboardIconName;
  trailingBadgeCount?: number;
  trailingAccessibilityLabel?: string;
  onTrailingPress?: () => void;
  showLogoutButton?: boolean;
  trailingProfile?: boolean;
};

export function DashboardHeader({
  title,
  subtitle,
  description,
  roleLabel,
  accentColor = dashboardTheme.colors.primary,
  titleAlign = 'left',
  trailingIcon,
  trailingBadgeCount,
  trailingAccessibilityLabel,
  onTrailingPress,
  showLogoutButton = false,
  trailingProfile = false
}: DashboardHeaderProps) {
  const { logout } = useAuth();
  const headerTextAlign = titleAlign === 'center' ? 'center' : 'left';

  return (
    <View style={styles.wrapper}>
      <View style={[styles.topRow, titleAlign === 'center' && styles.topRowCenter]}>
        <View style={styles.titleWrap}>
          {roleLabel ? <Text style={[styles.roleLabel, { color: accentColor }]}>{roleLabel}</Text> : null}
          <Text style={[styles.title, { textAlign: headerTextAlign }]}>{title}</Text>
        </View>
        {trailingIcon ? (
          <Pressable
            accessibilityLabel={trailingAccessibilityLabel ?? 'Header action'}
            accessibilityRole="button"
            onPress={onTrailingPress}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            {trailingProfile ? <ProfileImage size={32} /> : <DashboardGlyph color={dashboardTheme.colors.text} name={trailingIcon} size={18} />}
            {typeof trailingBadgeCount === 'number' && trailingBadgeCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{trailingBadgeCount > 99 ? '99+' : trailingBadgeCount}</Text>
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
    gap: 10,
    paddingBottom: 4
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
  titleWrap: { flex: 1, gap: 2 },
  roleLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
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
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.criticalSoft
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
