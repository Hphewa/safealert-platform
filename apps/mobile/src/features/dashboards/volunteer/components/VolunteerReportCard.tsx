import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { badgeToneForReportStatus } from '../../shared/utils';
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
      accessibilityLabel={`${report.status} ${report.severity} severity ${report.hazardType} at ${report.locationLabel}`}
      accessibilityRole="button"
      onPress={() => router.push(report.href)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <StatusBadge label={report.status} tone={badgeToneForReportStatus(report.status)} />
          <PriorityBadge priority={report.severity} />
        </View>
        <Text style={styles.timeText}>{report.reportedTimeLabel}</Text>
      </View>

      <View style={styles.mainRow}>
        <View style={styles.iconWrap}>
          <Image accessibilityLabel={`${report.hazardType} icon`} source={report.hazardImage} style={styles.hazardImage} />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{report.hazardType}</Text>
          <Text style={styles.location}>{report.locationLabel}</Text>
          <View style={styles.metaRow}>
            {report.distanceLabel ? <Text style={styles.metaText}>{report.distanceLabel}</Text> : null}
            <Text style={styles.metaText}>{report.reportedTimeLabel}</Text>
          </View>
          <View style={styles.evidenceRow}>
            <EvidenceItem active={report.hasPhotoEvidence} icon="camera-outline" label="Photo" />
            <EvidenceItem active={report.hasVoiceEvidence} icon="mic-outline" label="Voice" />
          </View>
          {report.relatedCommunityReportCount ? (
            <Text style={styles.relatedText}>
              {report.relatedCommunityReportCount} other related community report{report.relatedCommunityReportCount === 1 ? '' : 's'}
            </Text>
          ) : null}
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

function EvidenceItem({ active, icon, label }: { active: boolean; icon: 'camera-outline' | 'mic-outline'; label: string }) {
  return (
    <View style={[styles.evidenceItem, !active && styles.evidenceItemInactive]}>
      <DashboardGlyph color={active ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.muted} name={icon} size={14} />
      <Text style={[styles.evidenceLabel, !active && styles.evidenceLabelInactive]}>{label}</Text>
    </View>
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
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
  hazardImage: {
    width: 34,
    height: 34,
    resizeMode: 'contain'
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
  evidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  evidenceItemInactive: {
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  evidenceLabelInactive: {
    color: dashboardTheme.colors.muted
  },
  relatedText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
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
