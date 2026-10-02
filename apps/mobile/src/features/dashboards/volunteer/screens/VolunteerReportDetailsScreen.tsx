import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { FieldConfirmation } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { goBackSafely } from '@/features/navigation/safeBack';
import { ApiClientError } from '@/services/api/client';

import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { badgeToneForReportStatus } from '../../shared/utils';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VoiceNotePlayer } from '../../shared/voice/VoiceNotePlayer';
import { getCommunityReportById } from '../api/communityReportsApi';
import { listMyFieldConfirmations } from '../api/fieldConfirmationsApi';
import { VolunteerStateCard } from '../components/VolunteerStateCard';
import { volunteerBottomNavItems } from '../mockData';
import { VolunteerReportDetailItem } from '../components/VolunteerReportDetailItem';
import {
  mapCommunityReportToVolunteerReport,
  resolveVolunteerReportLocation,
  type VolunteerCommunityReport
} from '../reports';

function volunteerConfirmationHref(reportId: string) {
  return `/volunteer/reports/${encodeURIComponent(reportId)}/confirm?mode=confirmed` as const;
}

export function VolunteerReportDetailsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const [report, setReport] = useState<VolunteerCommunityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [myConfirmation, setMyConfirmation] = useState<FieldConfirmation | null>(null);

  const loadReport = useCallback(async () => {
    if (!reportId || !accessToken) {
      setReport(null);
      setErrorMessage('This report is unavailable right now.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setMyConfirmation(null);

    try {
      const [response, confirmationsResponse] = await Promise.all([
        getCommunityReportById(reportId, accessToken),
        listMyFieldConfirmations(accessToken)
      ]);
      setReport(await resolveVolunteerReportLocation(mapCommunityReportToVolunteerReport(response.report)));
      setMyConfirmation(confirmationsResponse.confirmations.find((confirmation) => confirmation.reportId === reportId) ?? null);
      setIsLoading(false);
    } catch (error) {
      setReport(null);
      setErrorMessage(
        error instanceof ApiClientError ? error.message : 'Unable to load this community report.'
      );
      setIsLoading(false);
    }
  }, [accessToken, reportId]);

  useEffect(() => {
    void (async () => {
      await loadReport();
    })();
  }, [loadReport]);

  if (isLoading) {
    return (
      <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => goBackSafely(router, '/volunteer/reports')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Report Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <VolunteerStateCard
          icon="refresh-outline"
          loading
          message="Retrieving the latest volunteer-safe report details."
          title="Loading Report Details"
        />
      </DashboardScreen>
    );
  }

  if (!report) {
    return (
      <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => goBackSafely(router, '/volunteer/reports')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Report Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <VolunteerStateCard
          actionLabel="Back to Reports"
          icon="document-text-outline"
          message={
            errorMessage ??
            'This report is no longer available for volunteer review or no longer requires confirmation.'
          }
          onActionPress={() => router.push('/volunteer/nearby')}
          title="Report Not Available"
        />
      </DashboardScreen>
    );
  }

  const photoUri = resolveMediaReferenceUri(report.mediaUrl);
  const voiceUri = resolveMediaReferenceUri(report.voiceEvidence?.mediaReference);
  const confirmation = myConfirmation;

  return (
    <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => goBackSafely(router, '/volunteer/reports')}
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
        <Image accessibilityLabel={`${report.hazardType} hazard icon`} source={report.hazardImage} style={styles.hazardImage} />
        <Text style={styles.heroTitle}>{report.hazardType}</Text>
        <Text style={styles.heroSubtitle}>{report.locationLabel}</Text>
        <Text style={styles.heroSummary}>
          Review what happened, where it was reported, and what evidence is available before heading into the field.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Report Overview</Text>
        <View style={styles.detailGrid}>
          <VolunteerReportDetailItem label="Reported" value={report.reportedDateTimeLabel} />
          <VolunteerReportDetailItem label="Severity" value={report.severity} />
          <VolunteerReportDetailItem label="Status" value={report.status} />
          <VolunteerReportDetailItem label="Location" value={report.locationLabel} />
          {report.distanceLabel ? (
            <VolunteerReportDetailItem label="Distance" value={report.distanceLabel} />
          ) : null}
          {report.relatedCommunityReportCount ? (
            <VolunteerReportDetailItem
              label="Related activity"
              value={`${report.relatedCommunityReportCount} other related community report${report.relatedCommunityReportCount === 1 ? '' : 's'}`}
            />
          ) : null}
          <VolunteerReportDetailItem label="Report Age" value={report.reportedTimeLabel} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Resident Description</Text>
        <Text style={styles.panelBody}>{report.description}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Photo Evidence</Text>
        {photoUri ? (
          <View style={styles.mediaBlock}>
            <Image
              accessibilityLabel={`${report.hazardType} evidence preview`}
              source={{ uri: photoUri }}
              style={styles.mediaPreview}
            />
            <Text style={styles.caption}>Safe preview media is available for this report.</Text>
          </View>
        ) : (
          <Text style={styles.panelBody}>No safe photo evidence is available for this report preview.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Voice Evidence</Text>
        {report.voiceEvidence ? (
          <VoiceNotePlayer
            durationSeconds={report.voiceEvidence.durationSeconds}
            title="Voice Note"
            uri={voiceUri}
          />
        ) : (
          <Text style={styles.panelBody}>No resident voice note is attached to this report.</Text>
        )}
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>{confirmation ? 'Field Check Submitted' : 'Community Field Check'}</Text>
          <Text style={styles.actionBody}>{confirmation
            ? confirmation.outcome === 'CONFIRMED'
              ? 'You confirmed the current situation. This decision is locked and cannot be changed.'
              : 'You marked this report as unable to confirm. This decision is locked and cannot be changed.'
            : 'Review the report in the field, add optional evidence, and submit your confirmation for Disaster Officer review.'}</Text>
        </View>
        {confirmation ? <View style={[styles.submittedBadge, confirmation.outcome === 'CONFIRMED' ? styles.confirmedBadge : styles.unableBadge]}>
          <Text style={styles.submittedBadgeText}>{confirmation.outcome === 'CONFIRMED' ? 'Confirmed' : 'Unable to Confirm'}</Text>
          <Text style={styles.submittedStatusText}>Officer review: {confirmation.status}</Text>
        </View> : <Pressable
          accessibilityRole="button"
          onPress={() => router.push(volunteerConfirmationHref(report.id))}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Start Field Confirmation</Text>
        </Pressable>}
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
  hazardImage: {
    width: 58,
    height: 58,
    resizeMode: 'contain',
    marginTop: 4
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
  submittedBadge: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    borderWidth: 1
  },
  confirmedBadge: { backgroundColor: dashboardTheme.colors.successSoft, borderColor: '#86efac' },
  unableBadge: { backgroundColor: dashboardTheme.colors.moderateSoft, borderColor: '#fdba74' },
  submittedBadgeText: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.text },
  submittedStatusText: { fontSize: 12, fontWeight: '700', color: dashboardTheme.colors.muted },
  pressed: {
    opacity: 0.82
  }
});
