import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { VolunteerReportListKey } from '../reports';

type VolunteerReportTabsProps = {
  activeTab: VolunteerReportListKey;
  tabs: ReadonlyArray<{
    key: VolunteerReportListKey;
    label: string;
  }>;
  onChange: (tab: VolunteerReportListKey) => void;
};

export function VolunteerReportTabs({ activeTab, tabs, onChange }: VolunteerReportTabsProps) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tabButton,
              isActive && styles.tabButtonActive,
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: dashboardTheme.radius.sm
  },
  tabButtonActive: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  tabLabelActive: {
    color: dashboardTheme.colors.primaryStrong
  },
  pressed: {
    opacity: 0.82
  }
});
