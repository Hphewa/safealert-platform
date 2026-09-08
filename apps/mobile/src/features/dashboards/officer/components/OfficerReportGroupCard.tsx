import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { badgeToneForReportStatus } from '../../shared/utils';
import type { OfficerGroupedReportSummary } from '../reports';

type OfficerReportGroupCardProps = {
  report: OfficerGroupedReportSummary;
};

export function OfficerReportGroupCard({ report }: OfficerReportGroupCardProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(report.href)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.hazardLabel}>{report.hazardLabel}</Text>
        <StatusBadge label={report.statusLabel} tone={badgeToneForReportStatus(report.status)} />
      </View>

      <View style={styles.mainRow}>
        <View style={[styles.iconWrap, toneBackgroundMap[report.tone]]}>
          <DashboardGlyph color={dashboardTheme.colors.text} name={report.icon} size={20} />
        </View>
        <View style={styles.body}>
          <Text style={styles.location}>{report.locationLabel}</Text>
          <Text style={styles.reportCount}>{report.communityReportsLabel}</Text>
          <Text style={styles.updateLabel}>Latest Update: {report.latestUpdateLabel}</Text>
        </View>
        <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
      </View>
    </Pressable>
  );
}

const toneBackgroundMap = {
  critical: {
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  high: {
    backgroundColor: dashboardTheme.colors.highSoft
  },
  moderate: {
    backgroundColor: dashboardTheme.colors.moderateSoft
  },
  low: {
    backgroundColor: dashboardTheme.colors.lowSoft
  },
  info: {
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  success: {
    backgroundColor: dashboardTheme.colors.successSoft
  },
  neutral: {
    backgroundColor: dashboardTheme.colors.surfaceMuted
  }
} as const;

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  cardPressed: {
    opacity: 0.82
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  hazardLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16
  },
  body: {
    flex: 1,
    gap: 4
  },
  location: {
    fontSize: 18,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  reportCount: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  updateLabel: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  }
});
