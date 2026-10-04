import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { FeaturePlaceholderScreen } from '../../shared/components/FeaturePlaceholderScreen';
import { volunteerBottomNavItems, volunteerPlaceholderContent } from '../mockData';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ProfileImage } from '../../shared/components/ProfileImage';
import { cardShadow, dashboardTheme } from '../../shared/theme';

export function VolunteerPlaceholderScreen() {
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screenKey = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const { user, logout } = useAuth();
  const placeholder =
    (screenKey && volunteerPlaceholderContent[screenKey]) || volunteerPlaceholderContent.profile;

  if (screenKey === 'profile') {
    return (
      <DashboardScreen bottomNavItems={volunteerBottomNavItems}>
        <DashboardHeader roleLabel="COMMUNITY OPERATIONS" accentColor={dashboardTheme.colors.teal} title="Volunteer Profile" description="Your community response account and field activity." />
        <View style={styles.profileCard}>
          <ProfileImage size={64} />
          <View style={styles.profileCopy}><Text style={styles.name}>{user?.name ?? 'Volunteer'}</Text><Text style={styles.email}>{user?.email ?? 'Community volunteer'}</Text><View style={styles.rolePill}><Text style={styles.roleText}>COMMUNITY VOLUNTEER</Text></View></View>
        </View>
        <View style={styles.accountCard}>
          <Text style={styles.sectionTitle}>FIELD ACCOUNT</Text>
          <View style={styles.statusRow}><DashboardGlyph color={dashboardTheme.colors.success} name="checkmark-circle-outline" size={18} /><Text style={styles.statusText}>Ready for community verification</Text></View>
          <Text style={styles.description}>Use Nearby Reports and Confirmations to support accurate, timely hazard information.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => { void logout(); }} style={styles.logoutButton}><DashboardGlyph color={dashboardTheme.colors.critical} name="log-out-outline" size={18} /><Text style={styles.logoutText}>Log out</Text></Pressable>
        </View>
      </DashboardScreen>
    );
  }

  return (
    <FeaturePlaceholderScreen
      bottomNavItems={volunteerBottomNavItems}
      description={placeholder.description}
      homeHref="/volunteer"
      title={placeholder.title}
    />
  );
}

const styles = StyleSheet.create({
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.navy, ...cardShadow },
  avatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: dashboardTheme.colors.teal },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#ffffff' },
  profileCopy: { flex: 1, gap: 5 },
  name: { fontSize: 21, fontWeight: '900', color: '#ffffff' },
  email: { fontSize: 14, color: '#c8d6e5' },
  rolePill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: dashboardTheme.colors.teal },
  roleText: { fontSize: 10, fontWeight: '900', color: '#ffffff', letterSpacing: 0.5 },
  accountCard: { gap: 14, padding: 18, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: dashboardTheme.colors.teal },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, fontWeight: '800', color: dashboardTheme.colors.text },
  description: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  logoutButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.criticalSoft },
  logoutText: { fontSize: 15, fontWeight: '800', color: dashboardTheme.colors.critical }
});
