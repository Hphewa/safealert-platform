import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResidentFieldConfirmation, SafeReport } from '@safealert/contracts';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError, apiBaseUrl } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { cancelMyPendingReport, getMyReportById, listMyReportFieldConfirmations } from '../api/reportApi';
import { residentBottomNavItems } from '../mockData';
import {
  buildResidentReportTimeline,
  canPreviewResidentReportMedia,
  formatResidentReportDateTime,
  formatResidentReportLocation,
  hazardIconForResident,
  hazardLabelForResident,
  isResidentReportEditable,
  residentReportEditHref,
  residentReportStatusSummary,
  severityToneForResident,
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
  const [actionStatus, setActionStatus] = useState<'idle' | 'cancelling'>('idle');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const cancelInFlightRef = useRef(false);
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
      } catch (error) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setLoadStatus('error');
        setFieldConfirmations([]);
        setErrorMessage(
          error instanceof ApiClientError || error instanceof Error
            ? error.message
            : 'Unable to load this report right now.'
        );
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

  const cancelReport = useCallback(async () => {
    if (!reportId || !accessToken || cancelInFlightRef.current) {
      return;
    }

    cancelInFlightRef.current = true;
    setActionStatus('cancelling');
    setActionMessage(null);

    try {
      const response = await cancelMyPendingReport(reportId, accessToken);
      setReport(response.report);
      setActionMessage('Report cancelled. It remains in your submitted report history.');
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.status === 409
          ? 'This report can no longer be changed because its status has been updated.'
          : error instanceof ApiClientError || error instanceof Error
            ? error.message
            : 'Unable to cancel this report right now.';

      setActionMessage(message);
      await loadReport(true);
    } finally {
      cancelInFlightRef.current = false;
      setActionStatus('idle');
    }
  }, [accessToken, loadReport, reportId]);

  const confirmCancelReport = useCallback(() => {
    Alert.alert(
      'Cancel this report?',
      'This report will no longer be sent through the verification process. You cannot edit it after cancellation.',
      [
        { text: 'Keep Report', style: 'cancel' },
        {
          text: 'Cancel Report',
          style: 'destructive',
          onPress: () => {
            void cancelReport();
          }
        }
      ]
    );
  }, [cancelReport]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
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
              onPress={() => router.back()}
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
              message="Retrieving the latest persisted report status."
              title="Loading Report"
            />
          ) : report ? (
            <ReportDetailContent
              actionMessage={actionMessage}
              fieldConfirmations={fieldConfirmations}
              isCancelling={actionStatus === 'cancelling'}
              onCancelReport={confirmCancelReport}
              onEditReport={() => router.push(residentReportEditHref(report.id))}
              report={report}
              refreshErrorMessage={errorMessage}
            />
          ) : (
            <ReportDetailStateCard
              actionLabel="Retry"
              icon="alert-circle-outline"
              message={errorMessage ?? 'Unable to load this report right now.'}
              onActionPress={() => void loadReport(true)}
              title="Unable to Load Report"
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
  fieldConfirmations,
  isCancelling,
  onCancelReport,
  onEditReport,
  report,
  refreshErrorMessage
}: {
  actionMessage: string | null;
  fieldConfirmations: ResidentFieldConfirmation[];
  isCancelling: boolean;
  onCancelReport: () => void;
  onEditReport: () => void;
  report: SafeReport;
  refreshErrorMessage: string | null;
}) {
  const hazardLabel = hazardLabelForResident(report.hazardType);
  const mediaUri = resolveResidentMediaUri(report.mediaReference);
  const timeline = buildResidentReportTimeline(report);
  const canEdit = isResidentReportEditable(report);

  return (
    <>
      <View style={styles.statusPanel}>
        <View style={styles.statusHeaderRow}>
          <View style={styles.hazardIconWrap}>
            <DashboardGlyph color={dashboardTheme.colors.info} name={hazardIconForResident(report.hazardType)} size={22} />
          </View>
          <View style={styles.statusTextBlock}>
            <Text style={styles.hazardTitle}>{hazardLabel}</Text>
            <Text style={styles.statusSummary}>{residentReportStatusSummary(report)}</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          <StatusBadge label={statusLabelForResident(report.status)} tone={statusToneForResident(report.status)} />
          <StatusBadge label={`${report.severity} severity`} tone={severityToneForResident(report.severity)} />
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
                {isCancelling ? 'Cancelling...' : 'Cancel Report'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {report.status === 'REJECTED' && report.rejectionReason ? (
        <View style={styles.rejectionPanel}>
          <View style={styles.rejectionTitleRow}>
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={18} />
            <Text style={styles.rejectionTitle}>Rejection reason</Text>
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
          <Text style={styles.rejectionReason}>This report was cancelled before verification.</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Report Information</Text>
        <DetailRow label="Report ID" value={report.id} />
        <DetailRow label="Hazard" value={hazardLabel} />
        <DetailRow label="Severity" value={report.severity} />
        <DetailRow label="Location" value={formatResidentReportLocation(report)} />
        <DetailRow label="Submitted" value={formatResidentReportDateTime(report.createdAt)} />
        <DetailRow label="Last updated" value={formatResidentReportDateTime(report.updatedAt)} />
        {report.verifiedAt ? <DetailRow label="Verified" value={formatResidentReportDateTime(report.verifiedAt)} /> : null}
        {report.rejectedAt ? <DetailRow label="Rejected" value={formatResidentReportDateTime(report.rejectedAt)} /> : null}
        {report.cancelledAt ? <DetailRow label="Cancelled" value={formatResidentReportDateTime(report.cancelledAt)} /> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Resident Description</Text>
        <Text style={styles.descriptionText}>{report.description}</Text>
      </View>

      {report.mediaReference ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Photo / Media Evidence</Text>
          {mediaUri && canPreviewResidentReportMedia(mediaUri) ? (
            <Image accessibilityLabel="Submitted report evidence" source={{ uri: mediaUri }} style={styles.mediaPreview} />
          ) : null}
          <Text style={styles.mediaReference}>{report.mediaReference}</Text>
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
        {fieldConfirmations.length ? (
          <View style={styles.timelineList}>
            {fieldConfirmations.map((confirmation) => (
              <CommunityFieldCheckCard confirmation={confirmation} key={confirmation.id} />
            ))}
          </View>
        ) : (
          <Text style={styles.descriptionText}>Not reviewed by a community volunteer yet.</Text>
        )}
      </View>
    </>
  );
}

function CommunityFieldCheckCard({ confirmation }: { confirmation: ResidentFieldConfirmation }) {
  const mediaUri = confirmation.outcome === 'CONFIRMED' ? resolveResidentMediaUri(confirmation.mediaReference) : undefined;
  return (
    <View style={styles.communityCard}>
      <Text style={styles.timelineTitle}>
        {confirmation.outcome === 'CONFIRMED' ? 'Confirmed by a community volunteer.' : 'Unable to confirm.'}
      </Text>
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
          <Text style={styles.timelineDetail}>Reason: {confirmation.reason}</Text>
          {confirmation.reasonDetails ? <Text style={styles.descriptionText}>{confirmation.reasonDetails}</Text> : null}
        </>
      )}
    </View>
  );
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
        <Text style={[styles.timelineMarkerText, toneStyles.markerText]}>{timelineSymbolFor(item.tone)}</Text>
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

function resolveResidentMediaUri(mediaReference: string | undefined) {
  if (!mediaReference) {
    return undefined;
  }

  if (/^(https?:|data:image\/)/i.test(mediaReference)) {
    return mediaReference;
  }

  if (mediaReference.startsWith('/')) {
    return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '')}${mediaReference}`;
  }

  return undefined;
}

function timelineSymbolFor(tone: ResidentReportTimelineItem['tone']) {
  switch (tone) {
    case 'success':
      return '?';
    case 'critical':
      return '�';
    case 'pending':
      return '?';
    case 'neutral':
      return '�';
  }
}

const timelineToneStyles = {
  success: {
    marker: {
      backgroundColor: dashboardTheme.colors.successSoft
    },
    markerText: {
      color: dashboardTheme.colors.success
    }
  },
  critical: {
    marker: {
      backgroundColor: dashboardTheme.colors.criticalSoft
    },
    markerText: {
      color: dashboardTheme.colors.critical
    }
  },
  pending: {
    marker: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    markerText: {
      color: dashboardTheme.colors.muted
    }
  },
  neutral: {
    marker: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    markerText: {
      color: dashboardTheme.colors.text
    }
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
  mediaReference: {
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
  timelineMarkerText: {
    fontSize: 15,
    fontWeight: '900'
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
