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
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
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
                size={19}
              />
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                numberOfLines={1}
                style={[styles.label, isActive && styles.labelActive]}
              >
                {item.label}
              </Text>
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
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  item: {
    flex: 1,
    minHeight: 58,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
    borderRadius: 12
  },
  itemActive: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  itemPressed: {
    opacity: 0.82
  },
  label: {
    width: '100%',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  labelActive: {
    color: dashboardTheme.colors.primaryStrong
  }
});
