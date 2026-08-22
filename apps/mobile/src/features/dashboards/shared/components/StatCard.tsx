import { StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from './DashboardGlyph';
import { cardShadow, dashboardTheme } from '../theme';
import type { SummaryStat } from '../types';

type StatCardProps = SummaryStat;

export function StatCard({ label, value, icon, tone = 'info' }: StatCardProps) {
  const toneStyles = toneStyleMap[tone];

  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, toneStyles.iconWrap]}>
        <DashboardGlyph color={toneStyles.iconColor} name={icon} size={18} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const toneStyleMap = {
  critical: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.criticalSoft
    },
    iconColor: dashboardTheme.colors.critical
  },
  high: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.highSoft
    },
    iconColor: dashboardTheme.colors.high
  },
  moderate: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.moderateSoft
    },
    iconColor: dashboardTheme.colors.moderate
  },
  low: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.lowSoft
    },
    iconColor: dashboardTheme.colors.low
  },
  info: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.infoSoft
    },
    iconColor: dashboardTheme.colors.info
  },
  success: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.successSoft
    },
    iconColor: dashboardTheme.colors.success
  },
  neutral: {
    iconWrap: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    iconColor: dashboardTheme.colors.text
  }
} as const;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  iconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19
  },
  label: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  }
});
