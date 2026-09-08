import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { cardShadow, dashboardTheme } from '../theme';
import type { BottomNavItem } from '../types';

type BottomNavigationProps = {
  items: BottomNavItem[];
};

export function BottomNavigation({ items }: BottomNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {items.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Pressable
              accessibilityRole="button"
              key={item.label}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && styles.itemPressed
              ]}
            >
              <DashboardGlyph
                color={isActive ? dashboardTheme.colors.primary : dashboardTheme.colors.muted}
                name={item.icon}
                size={20}
              />
              <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: dashboardTheme.colors.background
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: dashboardTheme.radius.sm
  },
  itemActive: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  itemPressed: {
    opacity: 0.82
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  labelActive: {
    color: dashboardTheme.colors.primaryStrong
  }
});
