import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import { volunteerBottomNavItems } from '../mockData';
import { listCommunityReports } from '../api/communityReportsApi';
import { VolunteerReportCard } from '../components/VolunteerReportCard';
import { VolunteerStateCard } from '../components/VolunteerStateCard';
import { VolunteerReportTabs } from '../components/VolunteerReportTabs';
import {
  mapCommunityReportToVolunteerReport,
  volunteerCommunityReportTabs,
  type VolunteerCommunityReport,
  type VolunteerReportListKey
} from '../reports';

const nearbyRadiusKm = 10;

type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';
type VolunteerReportsErrorKind =
  | 'permission-denied'
  | 'location-unavailable'
  | 'network'
  | 'api'
  | 'session';

export function VolunteerCommunityReportsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<VolunteerReportListKey>('nearby');
  const [reports, setReports] = useState<VolunteerCommunityReport[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<VolunteerReportsErrorKind | null>(null);
  const [locationSummary, setLocationSummary] = useState<string | null>(null);
  const inFlightTabRef = useRef<VolunteerReportListKey | null>(null);
  const latestRequestIdRef = useRef(0);

  const loadReports = useCallback(
    async (tab: VolunteerReportListKey, isRefresh = false) => {
      if (inFlightTabRef.current === tab) {
        return;
      }

      if (!accessToken) {
        setLoadStatus('error');
        setErrorKind('session');
        setErrorMessage('Your volunteer session is not available. Please log in again.');
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      inFlightTabRef.current = tab;
      setLoadStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);
      setErrorKind(null);

      try {
        if (tab === 'nearby') {
          const permission = await Location.requestForegroundPermissionsAsync();

          if (permission.status !== Location.PermissionStatus.GRANTED) {
            if (latestRequestIdRef.current !== requestId) {
              return;
            }

            setReports([]);
            setLocationSummary(null);
            setLoadStatus('error');
            setErrorKind('permission-denied');
            setErrorMessage('Location is needed to find nearby reports requiring confirmation.');
            return;
          }

          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });

          if (latestRequestIdRef.current !== requestId) {
            return;
          }

          const latitude = currentLocation.coords.latitude;
          const longitude = currentLocation.coords.longitude;

          setLocationSummary(`Using your current location within ${nearbyRadiusKm} km.`);

          const response = await listCommunityReports({
            mode: 'nearby',
            accessToken,
            latitude,
            longitude,
            radiusKm: nearbyRadiusKm
          });

          if (latestRequestIdRef.current !== requestId) {
            return;
          }

          setReports(response.reports.map(mapCommunityReportToVolunteerReport));
        } else {
          setLocationSummary('Showing newest eligible community reports.');

          const response = await listCommunityReports({
            mode: 'incoming',
            accessToken
          });

          if (latestRequestIdRef.current !== requestId) {
            return;
          }

          setReports(response.reports.map(mapCommunityReportToVolunteerReport));
        }

        setLoadStatus('success');
      } catch (error) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setReports([]);
        setLoadStatus('error');
        if (error instanceof ApiClientError) {
          setErrorKind(error.status === 0 ? 'network' : 'api');
          setErrorMessage('Community reports could not be loaded.');
        } else if (error instanceof Error) {
          setErrorKind('location-unavailable');
          setErrorMessage('We could not determine your current location. Check GPS/location services and try again.');
        } else {
          setErrorKind('api');
          setErrorMessage('Community reports could not be loaded.');
        }
      } finally {
        if (latestRequestIdRef.current === requestId && inFlightTabRef.current === tab) {
          inFlightTabRef.current = null;
        }
      }
    },
    [accessToken]
  );

  useFocusEffect(useCallback(() => {
    void loadReports(activeTab);
    return () => {
      latestRequestIdRef.current += 1;
      inFlightTabRef.current = null;
    };
  }, [activeTab, loadReports]));

  const isLoading = loadStatus === 'loading' || loadStatus === 'refreshing';
  const isNearby = activeTab === 'nearby';
  const isRefreshing = loadStatus === 'refreshing';
  const summaryText =
    errorMessage ??
    locationSummary ??
    (isNearby ? 'Nearby reports use your current device location.' : 'Incoming reports are ordered newest first.');
  const showInitialLoading = loadStatus === 'loading' && reports.length === 0;
  const showStateCard = (loadStatus === 'error' || loadStatus === 'success') && reports.length === 0;

  const retryCurrentTab = () => {
    void loadReports(activeTab, true);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <FlatList
          contentContainerStyle={styles.content}
          data={reports}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            showInitialLoading ? (
              <VolunteerStateCard
                icon="refresh-outline"
                loading
                message={
                  isNearby ? 'Retrieving nearby community reports for your current location.' : 'Retrieving the newest community reports.'
                }
                title={isNearby ? 'Loading Nearby Reports' : 'Loading Incoming Reports'}
              />
            ) : showStateCard ? (
              <VolunteerReportsEmptyOrErrorState
                activeTab={activeTab}
                errorKind={errorKind}
                errorMessage={errorMessage}
                onRetry={retryCurrentTab}
              />
            ) : null
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.headerRow}>
                <Pressable
                  accessibilityLabel="Go back"
                  accessibilityRole="button"
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
                </Pressable>

                <Text style={styles.headerTitle}>Community Reports</Text>

                <Pressable
                  accessibilityLabel="Refresh community reports"
                  accessibilityRole="button"
                  onPress={() => {
                    if (!isLoading) {
                      void loadReports(activeTab, true);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.iconButton,
                    isLoading && styles.iconButtonDisabled,
                    pressed && styles.pressed
                  ]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
                </Pressable>
              </View>

              <Text style={styles.description}>
                Review nearby community submissions and incoming items awaiting volunteer attention.
              </Text>
              <Text style={[styles.refreshSummary, errorMessage ? styles.errorText : null]}>{summaryText}</Text>

              <VolunteerReportTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={volunteerCommunityReportTabs}
              />
            </View>
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => {
                if (!isLoading) {
                  void loadReports(activeTab, true);
                }
              }}
              refreshing={isRefreshing}
              tintColor={dashboardTheme.colors.info}
            />
          }
          renderItem={({ item }) => <VolunteerReportCard report={item} />}
          showsVerticalScrollIndicator={false}
        />

        <BottomNavigation items={volunteerBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

type VolunteerReportsEmptyOrErrorStateProps = {
  activeTab: VolunteerReportListKey;
  errorKind: VolunteerReportsErrorKind | null;
  errorMessage: string | null;
  onRetry: () => void;
};

function VolunteerReportsEmptyOrErrorState({
  activeTab,
  errorKind,
  errorMessage,
  onRetry
}: VolunteerReportsEmptyOrErrorStateProps) {
  if (errorKind) {
    switch (errorKind) {
      case 'permission-denied':
        return (
          <VolunteerStateCard
            actionLabel="Allow Location"
            icon="locate-outline"
            message="Location is needed for Nearby reports. Grant permission to find reports requiring field confirmation near you."
            onActionPress={onRetry}
            title="Location Permission Needed"
          />
        );
      case 'location-unavailable':
        return (
          <VolunteerStateCard
            actionLabel="Retry Location"
            icon="locate-outline"
            message="We could not determine your current location. Check GPS/location services and try again."
            onActionPress={onRetry}
            title="Location Unavailable"
          />
        );
      case 'network':
      case 'api':
      case 'session':
        return (
          <VolunteerStateCard
            actionLabel="Retry"
            icon="alert-circle-outline"
            message={errorMessage ?? 'Community reports could not be loaded.'}
            onActionPress={onRetry}
            title="Unable to Load Reports"
          />
        );
    }
  }

  return activeTab === 'nearby' ? (
    <VolunteerStateCard
      icon="locate-outline"
      message="No community reports need your attention nearby."
      title="No Nearby Reports"
    />
  ) : (
    <VolunteerStateCard
      icon="time-outline"
      message="No new community reports need your field check."
      title="No Incoming Reports"
    />
  );
}

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
  headerBlock: {
    gap: 14,
    marginBottom: 6
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
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted
  },
  refreshSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.primaryStrong
  },
  errorText: {
    color: dashboardTheme.colors.critical
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
    opacity: 0.6
  },
  pressed: {
    opacity: 0.82
  }
});
