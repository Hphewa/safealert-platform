import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FailedWarningDelivery, WarningDeliverySummary } from '../api/warningApi';
import { cardShadow, dashboardTheme } from '../../shared/theme';

type Props = {
  delivery: { summary: WarningDeliverySummary; failedDeliveries: FailedWarningDelivery[] } | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

const statusRows = [
  { key: 'sent', label: 'Sent', icon: '✓' },
  { key: 'failed', label: 'Failed', icon: '✕' },
  { key: 'skipped', label: 'Skipped', icon: '—' }
] as const;

function ChannelCard({ name, counts }: { name: string; counts: WarningDeliverySummary['sms'] }) {
  return (
    <View style={styles.channel}>
      <Text accessibilityRole="header" style={styles.channelTitle}>{name}</Text>
      <View style={styles.statusCard}>
        {statusRows.map(({ key, label, icon }, index) => (
          <View
            key={key}
            accessible
            accessibilityLabel={`${name}: ${label}, ${counts[key]}`}
            style={[styles.statusRow, index > 0 && styles.rowDivider]}
          >
            <View style={[styles.statusIcon, styles[`${key}Background`]]}>
              <Text style={[styles.iconText, styles[`${key}Text`]]}>{icon}</Text>
            </View>
            <Text style={styles.statusLabel}>{label}</Text>
            <Text style={[styles.count, styles[`${key}Text`]]}>{counts[key]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatAttemptTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function FailedNotificationsSheet({ failures, onClose }: { failures: FailedWarningDelivery[]; onClose: () => void }) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss failed notifications"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Failed Notifications</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close failed notifications"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {failures.length ? failures.map(failure => (
              <View key={failure.id} style={styles.failureCard}>
                <Text style={styles.detailLabel}>Resident</Text>
                <Text style={styles.residentName}>{failure.resident}</Text>
                <View style={styles.failureBadges}>
                  <Text style={styles.channelBadge}>{failure.channel === 'SMS' ? 'SMS' : 'Push notifications'}</Text>
                  <Text style={styles.failedBadge}>{failure.status}</Text>
                </View>
                {failure.channel === 'SMS' && failure.phone ? (
                  <Text style={styles.detailText}>Phone: {failure.phone}</Text>
                ) : null}
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailText}>{failure.reason}</Text>
                <View style={styles.failureMeta}>
                  {failure.attemptCount != null ? (
                    <Text style={styles.helper}>Attempts: {failure.attemptCount}</Text>
                  ) : null}
                  {failure.lastAttemptAt ? (
                    <Text style={styles.helper}>Last attempt: {formatAttemptTime(failure.lastAttemptAt)}</Text>
                  ) : null}
                </View>
              </View>
            )) : <Text style={styles.helper}>Individual failed notification details are not available.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function WarningDeliveryPanel({ delivery, loading, error, onRetry }: Props) {
  const [showFailures, setShowFailures] = useState(false);
  // Use the summary counts; the failed-record list may not include every failure.
  const failedCount = delivery ? delivery.summary.sms.failed + delivery.summary.push.failed : 0;
  const recordedCount = delivery ? Object.values(delivery.summary.sms).reduce((sum, count) => sum + count, 0)
    + Object.values(delivery.summary.push).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>NOTIFICATION DELIVERY</Text>
        <Text style={styles.helper}>Delivery summary for this warning</Text>
      </View>
      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.loading}>
          <ActivityIndicator color={dashboardTheme.colors.primary} />
          <Text style={styles.helper}>Loading delivery status...</Text>
        </View>
      ) : error ? (
        <View style={styles.feedback}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading delivery status"
            onPress={onRetry}
            style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>Retry</Text>
          </Pressable>
        </View>
      ) : delivery && recordedCount > 0 ? (
        <>
          <ChannelCard name="SMS" counts={delivery.summary.sms} />
          <ChannelCard name="PUSH NOTIFICATIONS" counts={delivery.summary.push} />
          <Text style={styles.helper}>
            <Text style={styles.helperLabel}>Skipped: </Text>
            Notifications that were not sent because delivery requirements were not met.
          </Text>
          {failedCount > 0 ? (
            <View style={styles.issueCard}>
              <View accessibilityLiveRegion="polite" style={styles.feedbackRow}>
                <Text style={styles.issueIcon}>⚠</Text>
                <Text style={styles.issueText}>
                  {failedCount} {failedCount === 1 ? 'notification' : 'notifications'} failed
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View Failed Notifications"
                onPress={() => setShowFailures(true)}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <Text style={styles.actionButtonText}>View Failed Notifications</Text>
                <Text style={styles.actionChevron}>›</Text>
              </Pressable>
            </View>
          ) : (
            <View accessibilityLiveRegion="polite" style={[styles.feedbackRow, styles.noFailures]}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successText}>No failed notifications require attention.</Text>
            </View>
          )}
          {showFailures && failedCount > 0 ? (
            <FailedNotificationsSheet failures={delivery.failedDeliveries} onClose={() => setShowFailures(false)} />
          ) : null}
        </>
      ) : <Text style={styles.helper}>No delivery records are available for this warning yet. Status refreshes automatically while this screen is open.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 18, padding: 16, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surfaceMuted, borderWidth: 1, borderColor: dashboardTheme.colors.border },
  heading: { gap: 6 },
  title: { fontSize: 16, lineHeight: 23, fontWeight: '800', letterSpacing: 0.5, color: dashboardTheme.colors.text },
  helper: { fontSize: 13, lineHeight: 20, color: dashboardTheme.colors.muted, flexShrink: 1 },
  helperLabel: { fontWeight: '700' },
  channel: { gap: 9 },
  channelTitle: { fontSize: 14, lineHeight: 21, fontWeight: '800', letterSpacing: 0.6, color: dashboardTheme.colors.text },
  statusCard: { borderRadius: dashboardTheme.radius.sm, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, minHeight: 54 },
  rowDivider: { borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border },
  statusIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 16, fontWeight: '800' },
  sentBackground: { backgroundColor: dashboardTheme.colors.successSoft },
  failedBackground: { backgroundColor: dashboardTheme.colors.criticalSoft },
  skippedBackground: { backgroundColor: dashboardTheme.colors.background },
  sentText: { color: '#15803d' },
  failedText: { color: dashboardTheme.colors.critical },
  skippedText: { color: dashboardTheme.colors.muted },
  statusLabel: { flex: 1, flexShrink: 1, fontSize: 15, lineHeight: 22, color: dashboardTheme.colors.text, fontWeight: '600' },
  count: { flexShrink: 1, textAlign: 'right', fontSize: 24, lineHeight: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  feedback: { gap: 12 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  issueCard: { gap: 12, padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.criticalSoft, borderWidth: 1, borderColor: '#fecaca' },
  issueIcon: { fontSize: 21, color: dashboardTheme.colors.critical },
  issueText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '700', color: '#991b1b' },
  actionButton: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 14, gap: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: dashboardTheme.colors.primaryStrong },
  actionButtonText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '700', color: dashboardTheme.colors.surface },
  actionChevron: { fontSize: 24, color: dashboardTheme.colors.surface },
  outlineButton: { alignSelf: 'flex-start', minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: dashboardTheme.colors.primaryStrong, justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  noFailures: { padding: 12, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.successSoft },
  successIcon: { fontSize: 20, fontWeight: '800', color: '#15803d' },
  successText: { flex: 1, color: '#166534', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  errorText: { color: dashboardTheme.colors.critical, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.75 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: dashboardTheme.colors.border },
  sheetTitle: { flex: 1, fontSize: 20, lineHeight: 27, fontWeight: '800', color: dashboardTheme.colors.text },
  closeButton: { minWidth: 48, minHeight: 48, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: dashboardTheme.colors.primarySoft },
  closeText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  sheetContent: { padding: 16, gap: 14 },
  failureCard: { padding: 14, gap: 8, borderRadius: dashboardTheme.radius.sm, borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surfaceMuted },
  residentName: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: dashboardTheme.colors.text },
  failureBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channelBadge: { flexShrink: 1, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: dashboardTheme.colors.primarySoft, color: dashboardTheme.colors.primaryStrong, fontSize: 12, fontWeight: '700' },
  failedBadge: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: dashboardTheme.colors.criticalSoft, color: '#991b1b', fontSize: 12, fontWeight: '700' },
  detailLabel: { color: dashboardTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  detailText: { color: dashboardTheme.colors.text, fontSize: 14, lineHeight: 21 },
  failureMeta: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: dashboardTheme.colors.border }
});
