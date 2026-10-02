import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ResidentWarning } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { RoleStatusBanner } from '../../shared/components/RoleStatusBanner';
import { dashboardTheme } from '../../shared/theme';
import { getFirstName } from '../../shared/utils';
import { residentBottomNavItems, residentPrimaryActions } from '../mockData';
import { useReportHazardDraft } from '../reportDraft';
import { listResidentWarnings } from '../../../warnings/api/residentWarningApi';

function publishedLabel(publishedAt?: string) {
  if (!publishedAt) return 'Published recently';
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return 'Published recently';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function warningTone(riskLevel: ResidentWarning['riskLevel']) {
  return riskLevel === 'CRITICAL'
    ? { accent: dashboardTheme.colors.critical, soft: dashboardTheme.colors.criticalSoft }
    : { accent: dashboardTheme.colors.high, soft: dashboardTheme.colors.highSoft };
}

export function ResidentDashboardScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const { hasDraft, resetDraft } = useReportHazardDraft();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [warnings, setWarnings] = useState<ResidentWarning[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const firstName = user ? getFirstName(user.name) : 'Resident';
  const [primaryCard, reportsCard, helpCard] = residentPrimaryActions;

  const loadWarnings = useCallback(() => {
    if (!accessToken) {
      setWarnings([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }
    if (requestInFlight.current) return;

    let active = true;
    requestInFlight.current = true;
    setNotificationsLoading(true);
    setNotificationsError(null);
    void listResidentWarnings(accessToken)
      .then((result) => {
        if (active) setWarnings(result.warnings);
      })
      .catch(() => {
        if (active) setNotificationsError('Unable to load notifications.');
      })
      .finally(() => {
        requestInFlight.current = false;
        if (active) setNotificationsLoading(false);
      });

    return () => {
      active = false;
      requestInFlight.current = false;
    };
  }, [accessToken]);

  useFocusEffect(useCallback(() => loadWarnings(), [loadWarnings]));

  const openWarning = (warningId: string) => {
    setNotificationsOpen(false);
    router.push({ pathname: '/resident/warnings/[warningId]', params: { warningId } });
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems}>
      <DashboardHeader
        roleLabel="COMMUNITY SAFETY"
        accentColor={dashboardTheme.colors.primary}
        description="Stay informed. Stay safe."
        subtitle={`Hello, ${firstName}`}
        title="SafeAlert"
        titleAlign="center"
        trailingAccessibilityLabel="Notifications"
        trailingIcon="notifications-outline"
        onTrailingPress={() => setNotificationsOpen(true)}
        showLogoutButton
      />

      {warnings.length > 0 ? <RoleStatusBanner
        title={`${warnings.length} active safety warning${warnings.length === 1 ? '' : 's'}`}
        message="Review the latest warning for your area and follow official guidance."
        tone={warnings.some((warning) => warning.riskLevel === 'CRITICAL') ? 'critical' : 'warning'}
        icon="warning-outline"
        actionLabel="View"
        onAction={() => setNotificationsOpen(true)}
      /> : null}

      <ActionCard
        href={primaryCard.href}
        icon={primaryCard.icon}
        layout="row"
        subtitle={primaryCard.subtitle}
        title={primaryCard.title}
        onPress={() => {
          resetDraft();
          router.push('/resident/report-hazard?mode=new');
        }}
        variant="primary"
      />

      {hasDraft ? (
        <ActionCard
          href="/resident/report-hazard"
          icon="document-text-outline"
          layout="row"
          subtitle="Resume the report you started earlier"
          title="Continue Draft"
        />
      ) : null}

      <View style={styles.twoColumnGrid}>
        <ActionCard
          href={reportsCard.href}
          icon={reportsCard.icon}
          subtitle={reportsCard.subtitle}
          title={reportsCard.title}
        />
        <ActionCard
          href={helpCard.href}
          icon={helpCard.icon}
          subtitle={helpCard.subtitle}
          title={helpCard.title}
        />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setNotificationsOpen(false)}
        transparent
        visible={notificationsOpen}
      >
        <Pressable style={styles.notificationBackdrop} onPress={() => setNotificationsOpen(false)}>
          <Pressable style={styles.notificationPanel} onPress={() => undefined}>
            <View style={styles.notificationHeader}>
              <View style={styles.notificationHeaderLead}>
                <View style={styles.notificationHeaderIcon}>
                  <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="notifications-outline" size={18} />
                </View>
                <View style={styles.notificationHeaderCopy}>
                  <Text style={styles.notificationTitle}>Notifications</Text>
                  <Text style={styles.notificationSubtitle}>
                    {notificationsLoading
                      ? 'Checking for active warnings…'
                      : notificationsError
                        ? 'Could not refresh right now'
                        : warnings.length === 0
                          ? 'No active warnings'
                          : `${warnings.length} active warning${warnings.length === 1 ? '' : 's'}`}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Close notifications"
                accessibilityRole="button"
                onPress={() => setNotificationsOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            {notificationsLoading ? (
              <View style={styles.notificationState}>
                <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
                <Text style={styles.notificationStateText}>Loading notifications…</Text>
              </View>
            ) : notificationsError ? (
              <View style={styles.notificationState}>
                <Text style={styles.notificationStateTitle}>Unable to load notifications</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadWarnings()} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : warnings.length === 0 ? (
              <View style={styles.notificationState}>
                <Text style={styles.notificationStateTitle}>No active notifications</Text>
                <Text style={styles.notificationStateText}>You have no published warnings for your profile.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.notificationList}>
                {warnings.map((warning) => {
                  const tone = warningTone(warning.riskLevel);
                  return (
                    <Pressable
                      accessibilityLabel={`View ${warning.riskLevel.toLowerCase()} notification for ${warning.affectedArea}`}
                      accessibilityRole="button"
                      key={warning.id}
                      onPress={() => openWarning(warning.id)}
                      style={({ pressed }) => [
                        styles.notificationItem,
                        { borderLeftColor: tone.accent },
                        pressed && styles.notificationItemPressed
                      ]}
                    >
                      <View style={styles.notificationItemContent}>
                        <View style={styles.notificationItemTitleRow}>
                            <Text style={styles.notificationItemTitle}>Active safety warning</Text>
                            <Text style={[styles.notificationRisk, { color: tone.accent, backgroundColor: tone.soft }]}>{warning.riskLevel}</Text>
                          </View>
                          <View style={styles.notificationLocationRow}>
                            <DashboardGlyph color={dashboardTheme.colors.muted} name="locate-outline" size={14} />
                            <Text style={styles.notificationLocation} numberOfLines={1}>{warning.affectedArea}</Text>
                        </View>
                        <Text style={styles.notificationItemMessage} numberOfLines={2}>{warning.message}</Text>
                        <View style={styles.notificationItemFooter}>
                          <Text style={styles.notificationItemTime}>{publishedLabel(warning.publishedAt)}</Text>
                          <View style={styles.viewNotificationRow}>
                              <Text style={styles.viewNotification}>View warning →</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See all active warnings"
              onPress={() => {
                setNotificationsOpen(false);
                router.push('/resident/warnings');
              }}
              style={({ pressed }) => [styles.seeAllButton, pressed && styles.notificationItemPressed]}
            >
              <Text style={styles.seeAllText}>See all active warnings</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  twoColumnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  notificationBackdrop: {
    flex: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 68,
    backgroundColor: 'rgba(15, 23, 42, 0.28)'
  },
  notificationPanel: {
    width: '100%',
    maxWidth: 396,
    maxHeight: '82%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 12,
    backgroundColor: dashboardTheme.colors.surface,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  notificationHeaderLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  notificationHeaderIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#edf3ff' },
  notificationHeaderCopy: { flex: 1, gap: 2 },
  notificationTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: dashboardTheme.colors.text },
  notificationSubtitle: { fontSize: 11, lineHeight: 15, color: dashboardTheme.colors.muted },
  closeButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  closeText: { fontSize: 21, lineHeight: 24, color: dashboardTheme.colors.muted },
  notificationList: { paddingTop: 4, paddingBottom: 2 },
  notificationItem: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 11,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 11,
    backgroundColor: dashboardTheme.colors.surface
  },
  notificationItemPressed: { opacity: 0.72 },
  notificationItemContent: { flex: 1, gap: 4 },
  notificationItemTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notificationRisk: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.4 },
  notificationItemTitle: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '800', color: dashboardTheme.colors.text },
  notificationLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  notificationLocation: { flex: 1, fontSize: 12, lineHeight: 17, color: dashboardTheme.colors.muted },
  notificationItemMessage: { fontSize: 13, lineHeight: 18, color: dashboardTheme.colors.text },
  notificationItemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notificationItemTime: { fontSize: 11, lineHeight: 15, color: dashboardTheme.colors.muted },
  viewNotificationRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewNotification: { fontSize: 12, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  notificationState: { alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 24 },
  notificationStateTitle: { fontSize: 14, fontWeight: '800', color: dashboardTheme.colors.text, textAlign: 'center' },
  notificationStateText: { fontSize: 13, lineHeight: 18, color: dashboardTheme.colors.muted, textAlign: 'center' },
  retryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, backgroundColor: dashboardTheme.colors.primarySoft },
  retryText: { fontSize: 13, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  seeAllButton: { minHeight: 40, marginHorizontal: 12, marginTop: 10, marginBottom: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.primarySoft, borderRadius: 9, backgroundColor: dashboardTheme.colors.primarySoft },
  seeAllText: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: dashboardTheme.colors.primaryStrong }
});
