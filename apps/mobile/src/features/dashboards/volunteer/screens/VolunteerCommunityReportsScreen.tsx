import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
import { VolunteerReportTabs } from '../components/VolunteerReportTabs';
import {
  mapCommunityReportToVolunteerReport,
  volunteerCommunityReportTabs,
  type VolunteerCommunityReport,
  type VolunteerReportListKey
} from '../reports';

const nearbyRadiusKm = 10;

type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function VolunteerCommunityReportsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<VolunteerReportListKey>('nearby');
  const [reports, setReports] = useState<VolunteerCommunityReport[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationSummary, setLocationSummary] = useState<string | null>(null);

  const loadReports = useCallback(
    async (tab: VolunteerReportListKey, isRefresh = false) => {
      if (!accessToken) {
        setLoadStatus('error');
        setErrorMessage('Your volunteer session is not available. Please log in again.');
        return;
      }

      setLoadStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);

      try {
        if (tab === 'nearby') {
          const permission = await Location.requestForegroundPermissionsAsync();

          if (permission.status !== Location.PermissionStatus.GRANTED) {
            setReports([]);
            setLocationSummary(null);
            setLoadStatus('error');
            setErrorMessage('Location permission is needed to load nearby community reports.');
            return;
          }

          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });
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

          setReports(response.reports.map(mapCommunityReportToVolunteerReport));
        } else {
          setLocationSummary('Showing newest eligible community reports.');

          const response = await listCommunityReports({
            mode: 'incoming',
            accessToken
          });

          setReports(response.reports.map(mapCommunityReportToVolunteerReport));
        }

        setLoadStatus('success');
      } catch (error) {
        setReports([]);
        setLoadStatus('error');
        setErrorMessage(
          error instanceof ApiClientError ? error.message : 'Unable to load community reports right now.'
        );
      }
    },
    [accessToken]
  );

  useEffect(() => {
    void loadReports(activeTab);
  }, [activeTab, loadReports]);

  const isLoading = loadStatus === 'loading' || loadStatus === 'refreshing';
  const isNearby = activeTab === 'nearby';
  const summaryText =
    errorMessage ??
    locationSummary ??
    (isNearby ? 'Nearby reports use your current device location.' : 'Incoming reports are ordered newest first.');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <FlatList
          contentContainerStyle={styles.content}
          data={reports}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState />}
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
                  accessibilityLabel="Refresh report preview"
                  accessibilityRole="button"
                  onPress={() => {
                    void loadReports(activeTab, true);
                  }}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
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

              {isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={dashboardTheme.colors.info} size="small" />
                  <Text style={styles.loadingText}>
                    {isNearby ? 'Loading nearby community reports...' : 'Loading incoming community reports...'}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <VolunteerReportCard report={item} />}
          showsVerticalScrollIndicator={false}
        />

        <BottomNavigation items={volunteerBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No reports available</Text>
      <Text style={styles.emptyBody}>There are no eligible volunteer community reports to show for this view right now.</Text>
    </View>
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
  emptyState: {
    gap: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loadingText: {
    fontSize: 14,
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
