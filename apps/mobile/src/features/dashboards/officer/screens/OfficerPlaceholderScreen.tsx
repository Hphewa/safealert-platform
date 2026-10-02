import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ProfileImage } from '../../shared/components/ProfileImage';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { PlaceholderConfig } from '../../shared/types';
import { officerBottomNavItems } from '../officerNavigation';

const officerPlaceholderContent: Record<string, PlaceholderConfig> = {
  profile: {
    title: 'Officer Profile',
    description: 'Officer account preferences and profile settings will live here soon.'
  }
};

export function OfficerPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const { logout, user } = useAuth();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const placeholder =
    (screenKey && officerPlaceholderContent[screenKey]) || officerPlaceholderContent.profile;

  if (screenKey === 'profile') {
    return (
      <DashboardScreen bottomNavItems={officerBottomNavItems}>
        <DashboardHeader
          roleLabel="INCIDENT COMMAND"
          accentColor={dashboardTheme.colors.critical}
          description="Manage your officer account and session."
          title="Officer Profile"
        />
        <View style={styles.profileCard}>
          <ProfileImage size={64} />
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>{user?.name ?? 'Officer account'}</Text>
            <Text style={styles.profileDescription}>{user?.email ?? placeholder.description}</Text>
          </View>
        </View>
        <View style={styles.accountActions}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <Pressable
            accessibilityLabel="Log out"
            accessibilityRole="button"
            onPress={() => { void logout(); }}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.critical} name="log-out-outline" size={20} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      </DashboardScreen>
    );
  }

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={officerBottomNavItems}
      description={placeholder.description}
      homeHref="/officer"
      title={placeholder.title}
    />
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  profileIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  profileCopy: {
    flex: 1,
    gap: 6
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  profileDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  accountActions: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: dashboardTheme.colors.muted
  },
  logoutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  pressed: {
    opacity: 0.8
  }
});
