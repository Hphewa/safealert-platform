import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileImage } from './ProfileImage';
import { dashboardTheme } from '../theme';

function roleForPath(pathname: string) {
  if (pathname.startsWith('/volunteer')) return { label: 'VOLUNTEER', color: dashboardTheme.colors.teal, profile: '/volunteer/profile' as const };
  if (pathname.startsWith('/officer')) return { label: 'OFFICER', color: dashboardTheme.colors.critical, profile: '/officer/profile' as const };
  if (pathname.startsWith('/responder')) return { label: 'RESPONDER', color: dashboardTheme.colors.high, profile: '/responder/profile' as const };
  return { label: 'RESIDENT', color: dashboardTheme.colors.primary, profile: '/resident/notification-profile' as const };
}

export function DashboardTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const role = roleForPath(pathname);
  return <View style={styles.bar}>
    <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>!</Text></View><Text style={styles.brandText}>SafeAlert</Text></View>
    <View style={styles.right}><View style={[styles.role, { backgroundColor: role.color }]}><Text style={styles.roleText}>{role.label}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push(role.profile)} style={styles.profile}><ProfileImage size={30} /></Pressable></View>
  </View>;
}

const styles = StyleSheet.create({
  bar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: dashboardTheme.colors.primary, shadowColor: '#102a43', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: dashboardTheme.colors.critical },
  markText: { fontSize: 20, fontWeight: '900', color: '#ffffff' },
  brandText: { fontSize: 21, fontWeight: '900', color: '#ffffff', letterSpacing: -0.4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  role: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  roleText: { fontSize: 9, fontWeight: '900', color: '#ffffff', letterSpacing: 0.7 },
  profile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)' }
});
