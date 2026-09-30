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
          <View style={styles.metaRow}>
            <DashboardGlyph color={dashboardTheme.colors.muted} name="time-outline" size={14} />
            <Text style={styles.updateLabel}>{report.latestUpdateLabel}</Text>
          </View>
          <View style={styles.evidenceRow}>
            <EvidenceIcon active={Boolean(report.hasPhotoEvidence)} label="Photo" name="camera-outline" />
            <EvidenceIcon active={Boolean(report.hasVoiceEvidence)} label="Voice" name="mic-outline" />
          </View>
        </View>
        <DashboardGlyph color={dashboardTheme.colors.muted} name="chevron-forward" size={20} />
      </View>
    </Pressable>
  );
}

function EvidenceIcon({ active, label, name }: { active: boolean; label: string; name: 'camera-outline' | 'mic-outline' }) {
  return (
    <View style={[styles.evidenceItem, !active && styles.evidenceItemInactive]}>
      <DashboardGlyph color={active ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.muted} name={name} size={14} />
      <Text style={[styles.evidenceLabel, !active && styles.evidenceLabelInactive]}>{label}</Text>
    </View>
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
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.primarySoft
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
  }
});
