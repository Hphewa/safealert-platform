import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { badgeToneForReportStatus } from '../../shared/utils';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { volunteerBottomNavItems } from '../mockData';
import { VolunteerReportDetailItem } from '../components/VolunteerReportDetailItem';
import { getVolunteerCommunityReportById } from '../reports';

export function VolunteerReportDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const report = reportId ? getVolunteerCommunityReportById(reportId) : null;

  if (!report) {
    return (
      <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Report Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Report not found</Text>
          <Text style={styles.panelBody}>
            This volunteer report preview is unavailable. Return to Community Reports and select another item.
          </Text>
        </View>
      </DashboardScreen>
    );
  }

  return (
    <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Report Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.badgeRow}>
          <PriorityBadge priority={report.severity} />
          <StatusBadge label={report.status} tone={badgeToneForReportStatus(report.status)} />
        </View>
        <Text style={styles.heroTitle}>{report.hazardType}</Text>
        <Text style={styles.heroSubtitle}>{report.location}</Text>
        <Text style={styles.heroSummary}>
          Review what happened, where it was reported, and what evidence is available before heading into the field.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Report Overview</Text>
        <View style={styles.detailGrid}>
          <VolunteerReportDetailItem label="Reported" value={report.reportedDateTime} />
          <VolunteerReportDetailItem label="Severity" value={report.severity} />
          <VolunteerReportDetailItem label="Status" value={report.status} />
          <VolunteerReportDetailItem label="Location" value={report.location} />
          {report.distanceLabel ? (
            <VolunteerReportDetailItem label="Distance" value={report.distanceLabel} />
          ) : null}
          <VolunteerReportDetailItem label="Preview Age" value={report.reportedTime} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Resident Description</Text>
        <Text style={styles.panelBody}>{report.description}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Photo Evidence</Text>
        {report.mediaUrl ? (
          <View style={styles.mediaBlock}>
            <Image
              accessibilityLabel={`${report.hazardType} evidence preview`}
              source={{ uri: report.mediaUrl }}
              style={styles.mediaPreview}
            />
            <Text style={styles.caption}>Safe preview media is available for this report.</Text>
          </View>
        ) : (
          <Text style={styles.panelBody}>No safe photo evidence is available for this report preview.</Text>
        )}
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>Confirm in Field</Text>
          <Text style={styles.actionBody}>
            Field confirmation submission will be added in a later volunteer story. The original resident report stays read-only here.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/volunteer/confirmations')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Confirm in Field</Text>
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  heroCard: {
    gap: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  heroSummary: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  panel: {
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  panelBody: {
    fontSize: 15,
    lineHeight: 23,
    color: dashboardTheme.colors.muted
  },
  mediaBlock: {
    gap: 10
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  caption: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  },
  actionCard: {
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  actionCopy: {
    gap: 8
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  actionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
