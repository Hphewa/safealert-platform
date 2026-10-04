import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResidentFieldConfirmation, SafeReport } from '@safealert/contracts';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { goBackSafely } from '@/features/navigation/safeBack';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardTopBar } from '../../shared/components/DashboardTopBar';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { geoJsonPointToMapCoordinates } from '../../shared/maps/types';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VoiceNotePlayer } from '../../shared/voice/VoiceNotePlayer';
import { cancelMyPendingReport, getMyReportById, listMyReportFieldConfirmations } from '../api/reportApi';
import { residentBottomNavItems } from '../mockData';
import {
  buildResidentReportTimeline,
  canPreviewResidentReportMedia,
  formatResidentReportDateTime,
  hazardLabelForResident,
  isResidentReportEditable,
  officialReviewDetailForResident,
  residentReportEditHref,
  statusLabelForResident,
  statusToneForResident,
  type ResidentReportTimelineItem
} from '../reports';

type ResidentReportDetailLoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function ResidentReportDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const { accessToken } = useAuth();
  const [report, setReport] = useState<SafeReport | null>(null);
  const [fieldConfirmations, setFieldConfirmations] = useState<ResidentFieldConfirmation[]>([]);
  const [loadStatus, setLoadStatus] = useState<ResidentReportDetailLoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<'idle' | 'deleting'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [canRetryCancel, setCanRetryCancel] = useState(false);
  const inFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const reportRef = useRef<SafeReport | null>(null);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  const loadReport = useCallback(
    async (isRefresh = false) => {
      if (inFlightRef.current) {
        return;
      }

      if (!reportId) {
        setLoadStatus('error');
        setErrorMessage('Select a report to view its status.');
        return;
      }

      if (!accessToken) {
        setLoadStatus('error');
        setErrorMessage('Your resident session is unavailable. Please log in again.');
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      inFlightRef.current = true;
      setLoadStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);

      try {
        const [response, confirmationsResponse] = await Promise.all([
          getMyReportById(reportId, accessToken),
          listMyReportFieldConfirmations(reportId, accessToken)
        ]);

        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setReport(response.report);
        setFieldConfirmations(confirmationsResponse.confirmations);
        setLoadStatus('success');
      } catch {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setLoadStatus('error');
        setFieldConfirmations([]);
        setErrorMessage('Report could not be loaded.');
      } finally {
        if (latestRequestIdRef.current === requestId) {
          inFlightRef.current = false;
        }
      }
    },
    [accessToken, reportId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadReport(reportRef.current !== null);

      return () => {
        latestRequestIdRef.current += 1;
        inFlightRef.current = false;
      };
    }, [loadReport])
  );

  const isLoading = loadStatus === 'loading' || loadStatus === 'refreshing';
  const isInitialLoading = loadStatus === 'loading' && !report;
  const isRefreshing = loadStatus === 'refreshing';

  const deleteReport = useCallback(async () => {
    if (!reportId || !accessToken || deleteInFlightRef.current) {
      return;
    }

    deleteInFlightRef.current = true;
    setActionStatus('deleting');
    setActionMessage(null);
    setCanRetryCancel(false);

    try {
      await cancelMyPendingReport(reportId, accessToken);
      router.replace('/resident/reports');
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setActionMessage('This report can no longer be deleted because its status has changed.');
        setCanRetryCancel(false);
        await loadReport(true);
      } else {
        setActionMessage('Your report could not be deleted.');
        setCanRetryCancel(true);
      }
    } finally {
      deleteInFlightRef.current = false;
      setActionStatus('idle');
    }
  }, [accessToken, loadReport, reportId, router]);

  const confirmCancelReport = useCallback(() => {
    const message = 'This permanently removes the pending report from SafeAlert. This action cannot be undone.';

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(`Delete this report?\n\n${message}`)) {
        void deleteReport();
      }
      return;
    }

    Alert.alert(
      'Delete this report?',
      message,
      [
        { text: 'Keep Report', style: 'cancel' },
        {
          text: 'Delete Report',
          style: 'destructive',
          onPress: () => {
            void deleteReport();
          }
        }
      ]
    );
  }, [deleteReport]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <DashboardTopBar />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadReport(true)}
              refreshing={isRefreshing}
              tintColor={dashboardTheme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => goBackSafely(router, '/resident/reports')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
            </Pressable>

            <Text style={styles.headerTitle}>Report Details</Text>

            <Pressable
              accessibilityLabel="Refresh report details"
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoading }}
              disabled={isLoading}
              onPress={() => void loadReport(true)}
              style={({ pressed }) => [
                styles.iconButton,
                isLoading && styles.iconButtonDisabled,
                pressed && !isLoading && styles.pressed
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
              ) : (
                <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
              )}
            </Pressable>
          </View>

          {isInitialLoading ? (
            <ReportDetailStateCard
              icon="refresh-outline"
              loading
              message="Fetching the latest official status."
              title="Loading report..."
            />
          ) : report ? (
            <ReportDetailContent
              actionMessage={actionMessage}
              canRetryCancel={canRetryCancel}
              fieldConfirmations={fieldConfirmations}
              isCancelling={actionStatus === 'deleting'}
              onCancelReport={confirmCancelReport}
              onRetryCancel={deleteReport}
              onEditReport={() => router.push(residentReportEditHref(report.id))}
              report={report}
              refreshErrorMessage={errorMessage}
            />
          ) : (
            <ReportDetailStateCard
              actionLabel="Retry"
              icon="alert-circle-outline"
              message={errorMessage ?? 'Report could not be loaded.'}
              onActionPress={() => void loadReport(true)}
              title="Report could not be loaded."
            />
          )}
        </ScrollView>

        <BottomNavigation items={residentBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

function ReportDetailContent({
  actionMessage,
  canRetryCancel,
  fieldConfirmations,
  isCancelling,
  onCancelReport,
  onRetryCancel,
  onEditReport,
  report,
  refreshErrorMessage
}: {
  actionMessage: string | null;
  canRetryCancel: boolean;
  fieldConfirmations: ResidentFieldConfirmation[];
  isCancelling: boolean;
  onCancelReport: () => void;
  onRetryCancel: () => void;
  onEditReport: () => void;
  report: SafeReport;
  refreshErrorMessage: string | null;
}) {
  const hazardLabel = hazardLabelForResident(report.hazardType);
  const mediaUri = resolveMediaReferenceUri(report.mediaReference);
  const voiceUri = resolveMediaReferenceUri(report.voiceEvidence?.mediaReference);
  const timeline = buildResidentReportTimeline(report);
  const canEdit = isResidentReportEditable(report);
  const reportCoordinates = geoJsonPointToMapCoordinates(report.location);
  const hasDisplayablePhoto = mediaUri && canPreviewResidentReportMedia(mediaUri);
  const officialStatusLabel = statusLabelForResident(report.status);
  const officialStatusDetail = officialReviewDetailForResident(report.status);

  return (
    <>
      <View style={styles.statusPanel}>
        <Text style={styles.sectionEyebrow}>Official Review</Text>
        <View style={styles.statusHeaderRow}>
          <View style={styles.statusTextBlock}>
            <Text style={styles.hazardTitle}>{officialStatusLabel}</Text>
            <Text style={styles.statusSummary}>{officialStatusDetail}</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          <StatusBadge label={officialStatusLabel} tone={statusToneForResident(report.status)} />
        </View>
        {refreshErrorMessage ? <Text style={styles.inlineError}>{refreshErrorMessage}</Text> : null}
        {actionMessage ? <Text style={styles.inlineNotice}>{actionMessage}</Text> : null}
        {canEdit ? (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="Edit report"
              accessibilityRole="button"
              onPress={onEditReport}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            >
              <Text style={styles.editButtonText}>Edit Report</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Cancel report"
              accessibilityRole="button"
              accessibilityState={{ disabled: isCancelling }}
              disabled={isCancelling}
              onPress={onCancelReport}
              style={({ pressed }) => [
                styles.cancelReportButton,
                isCancelling && styles.buttonDisabled,
                pressed && !isCancelling && styles.pressed
              ]}
            >
              <Text style={styles.cancelReportButtonText}>
                {isCancelling ? 'Deleting...' : 'Delete Report'}
              </Text>
            </Pressable>
            {canRetryCancel ? (
              <Pressable
                accessibilityLabel="Try deleting report again"
                accessibilityRole="button"
                accessibilityState={{ disabled: isCancelling }}
                disabled={isCancelling}
                onPress={onRetryCancel}
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  isCancelling && styles.buttonDisabled,
                  pressed && !isCancelling && styles.pressed
                ]}
              >
                <Text style={styles.secondaryActionButtonText}>Try Again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {report.status === 'REJECTED' && report.rejectionReason ? (
        <View style={styles.rejectionPanel}>
          <View style={styles.rejectionTitleRow}>
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={18} />
            <Text style={styles.rejectionTitle}>Reason for rejection</Text>
          </View>
          <Text style={styles.rejectionReason}>{report.rejectionReason}</Text>
        </View>
      ) : null}

      {report.status === 'CANCELLED' ? (
        <View style={styles.cancelledPanel}>
          <View style={styles.rejectionTitleRow}>
            <DashboardGlyph color={dashboardTheme.colors.muted} name="close-circle-outline" size={18} />
            <Text style={styles.cancelledTitle}>Cancelled report</Text>
          </View>
          <Text style={styles.rejectionReason}>You cancelled this report before official review.</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Report Information</Text>
        <DetailRow label="Hazard" value={hazardLabel} />
        <DetailRow label="Severity" value={report.severity} />
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Selected location</Text>
          <HumanReadableLocation location={report.location} style={styles.detailValue} />
        </View>
        <DetailRow label="Submitted" value={formatResidentReportDateTime(report.createdAt)} />
        <DetailRow label="Last updated" value={formatResidentReportDateTime(report.updatedAt)} />
        {report.verifiedAt ? <DetailRow label="Verified" value={formatResidentReportDateTime(report.verifiedAt)} /> : null}
        {report.rejectedAt ? <DetailRow label="Rejected" value={formatResidentReportDateTime(report.rejectedAt)} /> : null}
        {report.cancelledAt ? <DetailRow label="Cancelled" value={formatResidentReportDateTime(report.cancelledAt)} /> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Reported Location</Text>
        <LocationPreview coordinates={reportCoordinates} title="Hazard location" />
        <Text style={styles.mapHintText}>This preview is read-only and does not change your report.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Resident Description</Text>
        <Text style={styles.descriptionText}>{report.description}</Text>
      </View>

      {report.mediaReference ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Photo / Media Evidence</Text>
          {hasDisplayablePhoto ? (
            <Image accessibilityLabel="Submitted report evidence" source={{ uri: mediaUri }} style={styles.mediaPreview} />
          ) : (
            <Text style={styles.descriptionText}>Photo evidence is attached, but preview is unavailable on this device.</Text>
          )}
        </View>
      ) : null}

      {report.voiceEvidence ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Voice Evidence</Text>
          <VoiceNotePlayer
            durationSeconds={report.voiceEvidence.durationSeconds}
            title="Voice Note"
            uri={voiceUri}
          />
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Status Timeline</Text>
        <View style={styles.timelineList}>
          {timeline.map((item) => (
            <TimelineRow item={item} key={item.id} />
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Community Field Check</Text>
        <Text style={styles.mapHintText}>
          Community volunteer checks are separate from the official review.
        </Text>
        {fieldConfirmations.length ? (
          <View style={styles.timelineList}>
            {fieldConfirmations.length > 1 ? (
              <Text style={styles.mapHintText}>
                {fieldConfirmations.length} community field checks are shown below.
              </Text>
            ) : null}
            {fieldConfirmations.map((confirmation) => (
              <CommunityFieldCheckCard confirmation={confirmation} key={confirmation.id} />
            ))}
          </View>
        ) : (
          <View style={styles.communityCard}>
            <Text style={styles.timelineTitle}>Not reviewed</Text>
            <Text style={styles.timelineDetail}>Not reviewed by a community volunteer yet.</Text>
          </View>
        )}
      </View>
    </>
  );
}

function CommunityFieldCheckCard({ confirmation }: { confirmation: ResidentFieldConfirmation }) {
  const mediaUri = confirmation.outcome === 'CONFIRMED' ? resolveMediaReferenceUri(confirmation.mediaReference) : undefined;
  return (
    <View style={styles.communityCard}>
      <Text style={styles.timelineTitle}>{communityFieldCheckTitle(confirmation)}</Text>
      <Text style={styles.timelineDetail}>{communityFieldCheckSummary(confirmation)}</Text>
      <Text style={styles.timelineTime}>{formatResidentReportDateTime(confirmation.createdAt)}</Text>
      {confirmation.outcome === 'CONFIRMED' ? (
        <>
          <Text style={styles.timelineDetail}>Location matches: {confirmation.verificationChecklist.locationMatches ? 'Yes' : 'No'}</Text>
          <Text style={styles.timelineDetail}>Photo matches: {confirmation.verificationChecklist.photoMatches ? 'Yes' : 'No'}</Text>
          <Text style={styles.timelineDetail}>Situation still exists: {confirmation.verificationChecklist.situationStillExists ? 'Yes' : 'No'}</Text>
          <Text style={styles.timelineDetail}>Severity appears correct: {confirmation.verificationChecklist.severityAppearsCorrect ? 'Yes' : 'No'}</Text>
          {confirmation.observation ? <Text style={styles.descriptionText}>{confirmation.observation}</Text> : null}
          {mediaUri && canPreviewResidentReportMedia(mediaUri) ? (
            <Image accessibilityLabel="Community volunteer field evidence" source={{ uri: mediaUri }} style={styles.mediaPreview} />
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.detailLabel}>Reason</Text>
          <Text style={styles.timelineDetail}>{confirmation.reason}</Text>
          {confirmation.reasonDetails ? <Text style={styles.descriptionText}>{confirmation.reasonDetails}</Text> : null}
        </>
      )}
    </View>
  );
}

function communityFieldCheckTitle(confirmation: ResidentFieldConfirmation) {
  return confirmation.outcome === 'CONFIRMED'
    ? 'Community field check confirmed'
    : 'Unable to confirm';
}

function communityFieldCheckSummary(confirmation: ResidentFieldConfirmation) {
  return confirmation.outcome === 'CONFIRMED'
    ? 'A community volunteer reported that the current situation matched this report.'
    : 'A community volunteer could not confirm that the current situation matched this report.';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function TimelineRow({ item }: { item: ResidentReportTimelineItem }) {
  const toneStyles = timelineToneStyles[item.tone];

  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineMarker, toneStyles.marker]}>
        <DashboardGlyph color={toneStyles.iconColor} name={timelineIconFor(item.tone)} size={18} />
      </View>
      <View style={styles.timelineBody}>
        <Text style={styles.timelineTitle}>{item.title}</Text>
        <Text style={styles.timelineDetail}>{item.detail}</Text>
        {item.timeLabel ? <Text style={styles.timelineTime}>{item.timeLabel}</Text> : null}
      </View>
    </View>
  );
}

function ReportDetailStateCard({
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
  loading = false
}: {
  title: string;
  message: string;
  icon: string;
  actionLabel?: string;
  onActionPress?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        {loading ? (
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
        ) : (
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={icon} size={22} />
        )}
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={({ pressed }) => [styles.stateActionButton, pressed && styles.pressed]}
        >
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function timelineIconFor(tone: ResidentReportTimelineItem['tone']) {
  switch (tone) {
    case 'success':
      return 'checkmark-done-outline';
    case 'critical':
      return 'alert-circle-outline';
    case 'pending':
      return 'time-outline';
    case 'neutral':
      return 'document-text-outline';
  }
}

const timelineToneStyles = {
  success: {
    marker: {
      backgroundColor: dashboardTheme.colors.successSoft
    },
    iconColor: dashboardTheme.colors.success
  },
  critical: {
    marker: {
      backgroundColor: dashboardTheme.colors.criticalSoft
    },
    iconColor: dashboardTheme.colors.critical
  },
  pending: {
    marker: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    iconColor: dashboardTheme.colors.muted
  },
  neutral: {
    marker: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    iconColor: dashboardTheme.colors.text
  }
} as const;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  contentWrap: {
    flex: 1,
    backgroundColor: dashboardTheme.colors.background
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
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
  iconButtonDisabled: {
    opacity: 0.55
  },
  statusPanel: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    color: dashboardTheme.colors.muted
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  hazardIconWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  statusTextBlock: {
    flex: 1,
    gap: 4
  },
  hazardTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  statusSummary: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  inlineError: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.critical
  },
  inlineNotice: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  editButton: {
    flexGrow: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  cancelReportButton: {
    flexGrow: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.critical,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  cancelReportButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  secondaryActionButton: {
    flexGrow: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  buttonDisabled: {
    opacity: 0.55
  },
  panel: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  detailRow: {
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: dashboardTheme.colors.border
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  mediaPreview: {
    width: '100%',
    height: 210,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  mapHintText: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  rejectionPanel: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.critical,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  rejectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rejectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  rejectionReason: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  cancelledPanel: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  cancelledTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  timelineList: {
    gap: 12
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12
  },
  timelineMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14
  },
  timelineBody: {
    flex: 1,
    gap: 3
  },
  communityCard: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  timelineDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
  },
  timelineTime: {
    fontSize: 13,
    color: dashboardTheme.colors.muted
  },
  stateCard: {
    gap: 12,
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  stateIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  stateMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  stateActionButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  stateActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
