import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { ActionCard } from '../../shared/components/ActionCard';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { ReportListItem } from '../../shared/components/ReportListItem';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { responderBottomNavItems } from '../mockData';
import { clearResponderRequestCache, getCachedAssignedResponderRequests, getCachedResponderRequest, replaceResponderRequestCache } from '../requestDetailsCache';
import { projectQueuedUpdates } from '../offline/responderUpdateQueue';
import { useResponderOffline } from '../offline/useResponderOffline';
import { ResponderOfflineStatus } from '../offline/ResponderOfflineStatus';
import { parseResponderRequestTab, responderRequestDetailsHref } from '../requestDetails';
import {
  emptyQueueDescription,
  emptyQueueTitle,
  responderQueueErrorMessage
} from '../requestFlowState';
import { presentResponderRequest } from '../requestPresentation';
import {
  getResponderQueueCounts,
  getVisibleResponderRequests,
  isActiveAssignedResponseStatus,
  type RequestTab,
  type ResponderQueueState
} from '../queueState';

type LoadState = 'loading' | 'ready' | 'error';

export function ResponderDashboardScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
  const queueLoadId = useRef(0);
  const loadQueuesRef = useRef<() => Promise<void>>(async () => undefined);


  // Automatically refresh authoritative queue lists when background sync succeeds (LDFEW-336)
  const offline = useResponderOffline(user, accessToken ?? '', {
    accessToken,
    onSyncSuccess: useCallback(async () => {
      await loadQueuesRef.current();
    }, [])
  });

  // Route state restores the selected queue on Back without first rendering Pending.
  const activeTab = parseResponderRequestTab(tab) ?? 'PENDING';
  const setActiveTab = (tab: RequestTab) => router.setParams({ tab });
  const [queueState, setQueueState] = useState<ResponderQueueState>({
    pending: [],
    assigned: []
  });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadQueues = useCallback(async () => {
    const loadId = ++queueLoadId.current;
    if (!accessToken) {
      setQueueState({ pending: [], assigned: [] });
      clearResponderRequestCache();
      setLoadState('error');
      setIsRefreshing(false);
      setErrorMessage('Your session has expired. Please log in again.');
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    if (offline.connectivity === 'offline') {
      setQueueState({ pending: [], assigned: user ? getCachedAssignedResponderRequests(user.id).filter((request) => isActiveAssignedResponseStatus(request.status)) : [] });
      setLoadState('ready');
      setIsRefreshing(false);
      return;
    }

    try {
      // Load both queues from the protected responder API so the dashboard
      // reflects current server data instead of local preview data.
      const [pending, assigned] = await Promise.all([
        listPendingResponderRequests(accessToken),
        listAssignedResponderRequests(accessToken)
      ]);

      if (loadId !== queueLoadId.current) return;

      const activeAssignedRequests = assigned.filter((request) =>
        request.assignedResponderId === user?.id && isActiveAssignedResponseStatus(request.status)
      );

      setQueueState({ pending, assigned: activeAssignedRequests });
      replaceResponderRequestCache([...pending, ...activeAssignedRequests]);
      setLoadState('ready');
      setIsRefreshing(false);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      if (loadId !== queueLoadId.current) return;

      // Initial connectivity may still be unknown after offline navigation. Do not
      // erase loaded assignments before the network listener has resolved its state.
      if (offline.connectivity !== 'online' && user) {
        setQueueState({ pending: [], assigned: getCachedAssignedResponderRequests(user.id).filter((request) => isActiveAssignedResponseStatus(request.status)) });
        setLoadState('ready');
        setIsRefreshing(false);
        setErrorMessage('Unable to refresh. Showing previously loaded assignments.');
        return;
      }

      setQueueState({ pending: [], assigned: [] });
      clearResponderRequestCache();
      setLoadState('error');
      setIsRefreshing(false);
      setErrorMessage(errorMessageFor(error));
    }
  }, [accessToken, user?.id, offline.connectivity]);
  loadQueuesRef.current = loadQueues;

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) {
        clearResponderRequestCache();
      }
      // Show confirmed progress immediately on return, then revalidate with the API.
      // Immediately purge requests that have been accepted or declined by this responder from Pending.
      setQueueState((current) => ({
        pending: current.pending
          .map((request) => getCachedResponderRequest(request.id) ?? request)
          .filter(
            (request) =>
              request.status === 'NEW' &&
              !(request.declinedByResponderIds ?? []).includes(user?.id ?? '')
          ),
        assigned: current.assigned
          .map((request) => getCachedResponderRequest(request.id) ?? request)
          .filter(
            (request) =>
              request.assignedResponderId === user?.id &&
              isActiveAssignedResponseStatus(request.status)
          )
      }));
      void loadQueues();
      return () => {
        // A request started before opening details must not overwrite newer progress.
        queueLoadId.current += 1;
      };
    }, [loadQueues, user?.id])
  );

  // Apply queued offline updates as an overlay on top of assigned requests so the
  // dashboard accurately reflects in-progress and completed work while offline,
  // preventing stale status badges and outdated active queue membership.
  const effectiveQueueState = useMemo((): ResponderQueueState => {
    if (!offline.items.length) {
      return queueState;
    }
    return {
      pending: queueState.pending,
      assigned: queueState.assigned
        .map((request) => projectQueuedUpdates(request, offline.items).request)
        .filter((request) => isActiveAssignedResponseStatus(request.status))
    };
  }, [queueState, offline.items]);

  const tabCounts = useMemo(() => getResponderQueueCounts(effectiveQueueState), [effectiveQueueState]);

  const visibleRequests = getVisibleResponderRequests(effectiveQueueState, activeTab);
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
          <View style={[styles.onlineDot, offline.connectivity !== 'online' && { backgroundColor: dashboardTheme.colors.moderate }]} />
          <Text style={[styles.onlineText, offline.connectivity !== 'online' && { color: dashboardTheme.colors.text }]}>{offline.connectivity === 'online' ? 'Online' : offline.connectivity === 'offline' ? 'Offline' : 'Checking connection'}</Text>
        </View>
        <Text style={styles.refreshLabel}>
          {isLoading || isRefreshing
            ? 'Loading requests...'
            : lastUpdated
              ? `Updated ${lastUpdated}`
              : 'Ready'}
        </Text>
      </View>
      <ResponderOfflineStatus {...offline} />
      {loadState === 'ready' && errorMessage ? <Text accessibilityRole="alert" style={styles.refreshLabel}>{errorMessage}</Text> : null}
      {offline.connectivity === 'offline' ? <Text style={styles.refreshLabel}>Showing previously loaded assignments. Connect to load pending requests.</Text> : null}

      <ActionCard title="View Risk Map" subtitle="View current assessed incident risks" href="/responder/risk-map" icon="map-outline" layout="row" />

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
          <Text style={styles.stateTitle}>{emptyQueueTitle(activeTab)}</Text>
          <Text style={styles.stateDescription}>{emptyQueueDescription(activeTab)}</Text>
        </QueueStateMessage>
      ) : (
        <View style={styles.list}>
          {visibleRequests.map((request) => (
            <ResponderRequestItem key={request.id} request={request} sourceTab={activeTab} />
          ))}
        </View>
      )}
    </DashboardScreen>
  );
}

function ResponderRequestItem({ request, sourceTab }: { request: SafeResponseRequest; sourceTab: RequestTab }) {
  const href = responderRequestDetailsHref(request.id, sourceTab);
  const presentation = presentResponderRequest(request);

  if (!href) {
    return null;
  }

  return (
    <ReportListItem
      detailItems={presentation.details}
      href={href}
      icon={assistanceTypeIcon(request.assistanceType)}
      statusLabel={presentation.status}
      statusTone={request.status === 'ASSIGNED' ? 'success' : 'info'}
      subtitle={presentation.location}
      timeLabel={presentation.submittedAt}
      title={presentation.title}
    />
  );
}

function QueueStateMessage({ children }: { children: React.ReactNode }) {
  return <View style={styles.stateMessage}>{children}</View>;
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
  return responderQueueErrorMessage(error instanceof ApiClientError && error.status === 0);
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
