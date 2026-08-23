import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { VolunteerCommunityReport } from '../reports';

type VolunteerReportCardProps = {
  report: VolunteerCommunityReport;
};

export function VolunteerReportCard({ report }: VolunteerReportCardProps) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityHint="Open the full volunteer report details view."
      accessibilityLabel={`${report.severity} severity ${report.hazardType} at ${report.location}`}
      accessibilityRole="button"
      onPress={() => router.push(report.href)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <PriorityBadge priority={report.severity} />
        <Text style={styles.timeText}>{report.reportedTime}</Text>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.iconWrap}>
          <DashboardGlyph color={dashboardTheme.colors.info} name={report.icon} size={20} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{report.hazardType}</Text>
          <Text style={styles.location}>{report.location}</Text>
          <View style={styles.metaRow}>
            {report.distanceLabel ? <Text style={styles.metaText}>{report.distanceLabel}</Text> : null}
            <Text style={styles.metaText}>{report.reportedTime}</Text>
          </View>
          {report.descriptionPreview ? (
            <Text numberOfLines={2} style={styles.description}>
              {report.descriptionPreview}
            </Text>
          ) : null}
        </View>

        <View style={styles.chevronWrap}>
          <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
        </View>
      </View>
    </Pressable>
  );
}

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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  content: {
    flex: 1,
    gap: 4
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  location: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardTheme.colors.text
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metaText: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  chevronWrap: {
    minHeight: 52,
    justifyContent: 'center'
  },
  pressed: {
    opacity: 0.82
  }
});
