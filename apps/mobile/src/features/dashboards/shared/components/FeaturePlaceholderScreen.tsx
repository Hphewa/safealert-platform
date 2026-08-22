import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardHeader } from './DashboardHeader';
import { DashboardGlyph } from './DashboardGlyph';
import { DashboardScreen } from './DashboardScreen';
import { cardShadow, dashboardTheme } from '../theme';
import type { BottomNavItem } from '../types';
import type { Href } from 'expo-router';

type FeaturePlaceholderScreenProps = {
  title: string;
  description: string;
  homeHref: Href;
  bottomNavItems: BottomNavItem[];
};

export function FeaturePlaceholderScreen({
  title,
  description,
  homeHref,
  bottomNavItems
}: FeaturePlaceholderScreenProps) {
  const router = useRouter();

  return (
    <DashboardScreen bottomNavItems={bottomNavItems}>
      <DashboardHeader
        description="Navigation is wired, and this feature area is reserved for the next build step."
        showLogoutButton
        title={title}
      />
      <View style={styles.card}>
        <View style={styles.illustration}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="construct-outline" size={22} />
        </View>
        <View style={styles.body}>
          <Text style={styles.heading}>Coming soon</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(homeHref)}
        style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
      >
        <DashboardGlyph color="#ffffff" name="arrow-back" size={18} />
        <Text style={styles.backButtonText}>Back to dashboard</Text>
      </Pressable>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  card: {
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
  illustration: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  body: {
    flex: 1,
    gap: 6
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  backButtonPressed: {
    opacity: 0.82
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff'
  }
});
