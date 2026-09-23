import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { responderBottomNavItems } from '../mockData';
import { clearResponderRequestCache, replaceResponderRequestCache } from '../requestDetailsCache';
import { responderRequestDetailsHref } from '../requestDetails';
import {
  getResponderQueueCounts,
  getVisibleResponderRequests,
  type RequestTab,
  type ResponderQueueState
} from '../queueState';

type LoadState = 'loading' | 'ready' | 'error';

export function ResponderDashboardScreen() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<RequestTab>('PENDING');
  const [queueState, setQueueState] = useState<ResponderQueueState>({
    pending: [],
    assigned: []
  });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadQueues = useCallback(async () => {
    if (!accessToken) {
      setQueueState({ pending: [], assigned: [] });
      setLoadState('error');
      setErrorMessage('Your session has expired. Please log in again.');
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      // Load both queues from the protected responder API so the dashboard
      // reflects current server data instead of local preview data.
      const [pending, assigned] = await Promise.all([
        listPendingResponderRequests(accessToken),
        listAssignedResponderRequests(accessToken)
      ]);

      setQueueState({ pending, assigned });
      replaceResponderRequestCache([...pending, ...assigned]);
      setLoadState('ready');
      setIsRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      setQueueState({ pending: [], assigned: [] });
      clearResponderRequestCache();
      setLoadState('error');
      setIsRefreshing(false);
      setErrorMessage(errorMessageFor(error));
    }
  }, [accessToken]);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  const tabCounts = useMemo(() => getResponderQueueCounts(queueState), [queueState]);

  const visibleRequests = getVisibleResponderRequests(queueState, activeTab);
  const isLoading = loadState === 'loading';

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems}>
      <DashboardHeader
        showLogoutButton
        title="Emergency Requests"
        trailingIcon="refresh-outline"
        onTrailingPress={() => void loadQueues()}
      />

      <View style={styles.statusRow}>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
        <Text style={styles.refreshLabel}>
          {isLoading || isRefreshing
            ? 'Loading requests...'
            : lastUpdated
              ? `Updated ${lastUpdated}`
              : 'Ready'}
        </Text>
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

      <Text style={styles.sectionCaption}>
        {activeTab === 'PENDING' ? 'Pending requests' : 'Assigned requests'}
      </Text>

      {isLoading ? (
        <QueueStateMessage>
          <ActivityIndicator color={dashboardTheme.colors.primaryStrong} />
          <Text style={styles.stateTitle}>Loading requests</Text>
          <Text style={styles.stateDescription}>Checking the latest responder queues.</Text>
        </QueueStateMessage>
      ) : loadState === 'error' ? (
        <QueueStateMessage>
          <Text style={styles.stateTitle}>Unable to load requests</Text>
          <Text style={styles.stateDescription}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadQueues()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.tabPressed]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </QueueStateMessage>
      ) : visibleRequests.length === 0 ? (
        <QueueStateMessage>
          <Text style={styles.stateTitle}>
            No {activeTab === 'PENDING' ? 'pending' : 'assigned'} requests
          </Text>
          <Text style={styles.stateDescription}>
            {activeTab === 'PENDING'
              ? 'There are currently no emergency requests waiting for response.'
              : 'There are currently no emergency requests assigned to you.'}
          </Text>
        </QueueStateMessage>
      ) : (
        <View style={styles.list}>
          {visibleRequests.map((request) => (
            <ResponderRequestItem key={request.id} request={request} />
          ))}
        </View>
      )}
    </DashboardScreen>
  );
}

function ResponderRequestItem({ request }: { request: SafeResponseRequest }) {
  const href = responderRequestDetailsHref(request.id);

  if (!href) {
    return null;
  }

  return (
    <ReportListItem
      detailItems={[`${request.affectedPeople} people`, `${request.injuredPeople} injured`]}
      href={href}
      icon={assistanceTypeIcon(request.assistanceType)}
      statusLabel={request.status}
      statusTone={request.status === 'ASSIGNED' ? 'success' : 'info'}
      subtitle={formatLocation(request)}
      timeLabel={formatCreatedAt(request.createdAt)}
      title={formatAssistanceType(request.assistanceType)}
    />
  );
}

function QueueStateMessage({ children }: { children: React.ReactNode }) {
  return <View style={styles.stateMessage}>{children}</View>;
}

function formatAssistanceType(assistanceType: SafeResponseRequest['assistanceType']) {
  return assistanceType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLocation(request: SafeResponseRequest) {
  const [longitude, latitude] = request.location.coordinates;
  return `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function formatCreatedAt(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

function assistanceTypeIcon(assistanceType: SafeResponseRequest['assistanceType']) {
  switch (assistanceType) {
    case 'MEDICAL_ASSISTANCE':
      return 'medical-outline';
    case 'RESCUE_EVACUATION':
      return 'bus-outline';
    case 'FLOOD_ASSISTANCE':
      return 'water-outline';
    case 'SHELTER_RELOCATION':
      return 'home-outline';
    default:
      return 'help-buoy-outline';
  }
}

function errorMessageFor(error: unknown) {
  if (error instanceof ApiClientError && error.status === 0) {
    return 'Check your connection and try again.';
  }

  return 'The responder request queues could not be loaded. Please try again.';
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
      accessibilityLabel={`${label} requests, ${count}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.tabPressed
      ]}
    >
      <View style={styles.tabContent}>
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
        {active ? <View style={styles.activeTabIndicator} /> : null}
      </View>
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
  tabContent: {
    alignItems: 'center',
    gap: 4
  },
  activeTabIndicator: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ffffff'
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
  },
  stateMessage: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 20
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: dashboardTheme.colors.text,
    textAlign: 'center'
  },
  stateDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted,
    textAlign: 'center'
  },
  retryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primaryStrong,
    marginTop: 8
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff'
  }
});
