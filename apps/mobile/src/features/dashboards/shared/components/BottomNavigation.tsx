import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { DashboardGlyph } from './DashboardGlyph';
import { cardShadow, dashboardTheme } from '../theme';
import type { BottomNavItem } from '../types';

type BottomNavigationProps = {
  items: BottomNavItem[];
};

export function BottomNavigation({ items }: BottomNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOfficerNavigation = items.some((item) => typeof item.href === 'string' && item.href.startsWith('/officer'));

  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {items.map((item) => {
          const href = typeof item.href === 'string' ? item.href : '';
          const isActive = href === '/officer'
            ? pathname === href
            : pathname === href || (isOfficerNavigation && pathname.startsWith(`${href}/`));
          const label = isOfficerNavigation ? officerLabels[item.label] ?? item.label : item.label;
          const symbol = isOfficerNavigation ? officerSymbols[item.icon] : undefined;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isActive }}
              key={item.label}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && styles.itemPressed
              ]}
            >
              {symbol ? <SymbolView name={symbol} size={20}
                tintColor={isActive ? dashboardTheme.colors.primary : dashboardTheme.colors.muted} /> : <DashboardGlyph
                  color={isActive ? dashboardTheme.colors.primary : dashboardTheme.colors.muted}
                  name={item.icon}
                  size={20}
                />}
              <Text numberOfLines={1} style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const officerLabels: Record<string, string> = {
  Assessments: 'Assess',
  Monitoring: 'Monitor'
};

const officerSymbols: Record<string, SymbolViewProps['name']> = {
  'home-outline': { ios: 'house', android: 'home', web: 'home' },
  'document-text-outline': { ios: 'doc.text', android: 'description', web: 'description' },
  'shield-checkmark-outline': { ios: 'checkmark.shield', android: 'fact_check', web: 'fact_check' },
  'eye-outline': { ios: 'eye', android: 'visibility', web: 'visibility' },
  'warning-outline': { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }
};

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
