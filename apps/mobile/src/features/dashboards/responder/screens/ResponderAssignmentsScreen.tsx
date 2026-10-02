import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { DashboardHeader } from '../../shared/components/DashboardHeader';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { extractEmergencyCoordinates, initiateViewLocationRoute } from '../contactLocationUi';
import { presentResponderAssignment } from '../requestPresentation';
import { responderRequestDetailsHref, type ResponderAssignmentView } from '../requestDetails';
import { ResponderOfflineStatus } from '../offline/ResponderOfflineStatus';
import { useResponderAssignments } from '../useResponderAssignments';

const screenContent = {
  active: {
    title: 'Active Responses', description: 'Continue emergency responses assigned to you.',
    emptyTitle: 'No active responses', emptyDescription: 'Accepted emergency requests will appear here.'
  },
  map: {
    title: 'Response Locations', description: 'View your active emergency locations and open directions.',
    emptyTitle: 'No active response locations', emptyDescription: 'Accepted emergency requests will appear here.'
  },
  history: {
    title: 'Response History', description: 'Review emergency requests you have completed.',
    emptyTitle: 'No completed responses yet.', emptyDescription: 'Requests you complete will appear here.'
  }
} satisfies Record<ResponderAssignmentView, { title: string; description: string; emptyTitle: string; emptyDescription: string }>;

export function ResponderAssignmentsScreen({ view }: { view: ResponderAssignmentView }) {
  const router = useRouter();
  const assignments = useResponderAssignments(view);
  const content = screenContent[view];
  const routeInFlight = useRef(false);
  const [openingRouteId, setOpeningRouteId] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<{ id: string; message: string } | null>(null);
  const actionScope = useRef({ active: true });
  useEffect(() => {
    actionScope.current.active = true;
    return () => { actionScope.current.active = false; };
  }, []);

  const openRoute = async (request: SafeResponseRequest) => {
    const coordinates = extractEmergencyCoordinates(request.location);
    if (routeInFlight.current || !coordinates.isValid) return;
    routeInFlight.current = true;
    setOpeningRouteId(request.id);
    setRouteError(null);
    const scope = assignments.offline;
    const isCurrent = () => actionScope.current.active && scope.isCurrent();
    try {
      const opened = await initiateViewLocationRoute(coordinates.latitude, coordinates.longitude);
      if (!opened && isCurrent()) setRouteError({ id: request.id, message: 'Unable to open the map or browser. Please try again.' });
    } catch {
      if (isCurrent()) setRouteError({ id: request.id, message: 'Unable to open directions. Please try again.' });
    } finally {
      routeInFlight.current = false;
      if (isCurrent()) setOpeningRouteId(null);
    }
  };

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems}>
      <DashboardHeader title={content.title} description={content.description} />
      <View style={styles.refreshRow}>
        <Text style={styles.description}>
          {assignments.loading || assignments.refreshing ? 'Loading responses...' : `${assignments.requests.length} ${view === 'history' ? 'completed' : 'active'} responses`}
        </Text>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Refresh responses"
          accessibilityState={{ disabled: !assignments.canRefresh || assignments.refreshing, busy: assignments.refreshing }}
          disabled={!assignments.canRefresh || assignments.refreshing}
          onPress={() => void assignments.refresh()} style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>
      <ResponderOfflineStatus {...assignments.offline} />
      {assignments.offline.connectivity === 'offline' ? (
        <Text style={styles.description}>Showing previously loaded responses. Connect to refresh this list.</Text>
      ) : null}
      {assignments.loading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={dashboardTheme.colors.primaryStrong} />
          <Text accessibilityLiveRegion="polite" style={styles.title}>Loading responses</Text>
        </View>
      ) : assignments.error ? (
        <View style={styles.statePanel}>
          <Text accessibilityRole="alert" style={styles.error}>{assignments.error}</Text>
          {assignments.canRefresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry responses"
              disabled={assignments.refreshing} accessibilityState={{ disabled: assignments.refreshing }}
              onPress={() => void assignments.refresh()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : assignments.requests.length === 0 ? (
        <View style={styles.statePanel}>
          <Text style={styles.title}>{content.emptyTitle}</Text>
          <Text style={styles.description}>{content.emptyDescription}</Text>
        </View>
      ) : null}
      {!assignments.loading && assignments.requests.map((request) => {
        const presentation = presentResponderAssignment(request, view === 'history');
        const coordinates = extractEmergencyCoordinates(request.location);
        const href = responderRequestDetailsHref(request.id, 'ASSIGNED', view);
        return (
          <View key={request.id} style={styles.card}>
            <StatusBadge label={presentation.status} tone={view === 'history' ? 'success' : 'info'} />
            <Text accessibilityRole="header" style={styles.title}>{presentation.title}</Text>
            <Text style={styles.description}>{presentation.details.join(' · ')}</Text>
            <Text style={styles.description}>{coordinates.isValid ? presentation.location : 'Emergency location unavailable'}</Text>
            <Text style={styles.description}>
              {view === 'history' ? 'Completed' : 'Last updated'}: {presentation.updatedAt ?? 'Time unavailable'}
            </Text>
            {view === 'history' && request.completionSummary ? <Text style={styles.description}>{request.completionSummary}</Text> : null}
            {/* Reuse the native map preview; web and missing-coordinate cases retain a readable location fallback. */}
            {view === 'map' && coordinates.isValid && coordinates.latitude !== null && coordinates.longitude !== null ? (
              <LocationPreview coordinates={{ latitude: coordinates.latitude, longitude: coordinates.longitude }} title={presentation.title} height={180} />
            ) : null}
            <Pressable
              accessibilityRole="button" accessibilityLabel={`${view === 'active' ? 'Continue Response' : 'Open Request'}: ${presentation.title}`}
              disabled={!href} accessibilityState={{ disabled: !href }}
              onPress={() => { if (href) router.push(href); }} style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{view === 'active' ? 'Continue Response' : 'Open Request'}</Text>
            </Pressable>
            {view === 'map' ? (
              <>
                <Pressable
                  accessibilityRole="button" accessibilityLabel={`View Location / Route: ${presentation.title}`}
                  disabled={!coordinates.isValid || openingRouteId !== null}
                  accessibilityState={{ disabled: !coordinates.isValid || openingRouteId !== null, busy: openingRouteId === request.id }}
                  onPress={() => void openRoute(request)}
                  style={[styles.secondaryButton, (!coordinates.isValid || openingRouteId !== null) && styles.disabled]}
                >
                  <Text style={styles.secondaryButtonText}>{openingRouteId === request.id ? 'Opening directions...' : 'View Location / Route'}</Text>
                </Pressable>
                {routeError?.id === request.id ? <Text accessibilityRole="alert" style={styles.error}>{routeError.message}</Text> : null}
              </>
            ) : null}
          </View>
        );
      })}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: {
    gap: 12, padding: 16, borderWidth: 1, borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface, ...cardShadow
  },
  title: { fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text },
  description: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.muted },
  statePanel: { alignItems: 'center', gap: 12, paddingVertical: 30, paddingHorizontal: 16 },
  error: { fontSize: 14, lineHeight: 21, color: dashboardTheme.colors.critical },
  primaryButton: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12,
    borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primaryStrong
  },
  primaryButtonText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  secondaryButton: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700', color: dashboardTheme.colors.primaryStrong },
  disabled: { opacity: 0.5 }
});
