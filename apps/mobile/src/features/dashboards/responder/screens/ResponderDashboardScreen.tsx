import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems, responderRequests } from '../mockData';

type RequestTab = 'PENDING' | 'ASSIGNED';

export function ResponderDashboardScreen() {
  const [activeTab, setActiveTab] = useState<RequestTab>('PENDING');
  const [refreshLabel, setRefreshLabel] = useState('Preview data ready');

  const tabCounts = useMemo(
    () => ({
      PENDING: responderRequests.filter((request) => request.status === 'PENDING').length,
      ASSIGNED: responderRequests.filter((request) => request.status === 'ASSIGNED').length
    }),
    []
  );

  const visibleRequests = responderRequests.filter((request) => request.status === activeTab);

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems}>
      <DashboardHeader
        showLogoutButton
        title="Emergency Requests"
        trailingIcon="refresh-outline"
        onTrailingPress={() => setRefreshLabel('Preview data refreshed just now')}
      />

      <View style={styles.statusRow}>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
        <Text style={styles.refreshLabel}>{refreshLabel}</Text>
      </View>

      <View style={styles.tabRow}>
        <ResponderTab
          active={activeTab === 'PENDING'}
          count={tabCounts.PENDING}
          label="Pending"
          onPress={() => setActiveTab('PENDING')}
        />
        <ResponderTab
          active={activeTab === 'ASSIGNED'}
          count={tabCounts.ASSIGNED}
          label="Assigned"
          onPress={() => setActiveTab('ASSIGNED')}
        />
      </View>

      <Text style={styles.sectionCaption}>Requests ordered by priority</Text>

      <View style={styles.list}>
        {visibleRequests.map((request) => (
          <ReportListItem
            detailItems={[
              `${request.peopleAffected} people`,
              `${request.injuredCount} injured`,
              request.distanceLabel
            ]}
            href={request.href}
            icon={request.icon}
            key={request.id}
            severity={request.priority}
            subtitle={request.location}
            timeLabel={request.reportedTime}
            title={request.emergencyType}
          />
        ))}
      </View>
    </DashboardScreen>
  );
}

type ResponderTabProps = {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
};

function ResponderTab({ label, count, active, onPress }: ResponderTabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.tabPressed
      ]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      <View style={[styles.tabCount, active && styles.tabCountActive]}>
        <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dashboardTheme.colors.success
  },
  onlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  refreshLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  tabRow: {
    flexDirection: 'row',
    gap: 12
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  tabActive: {
    backgroundColor: dashboardTheme.colors.primaryStrong,
    borderColor: dashboardTheme.colors.primaryStrong
  },
  tabPressed: {
    opacity: 0.82
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  tabLabelActive: {
    color: '#ffffff'
  },
  tabCount: {
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  tabCountText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  tabCountTextActive: {
    color: '#ffffff'
  },
  sectionCaption: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  list: {
    gap: 12
  }
});
