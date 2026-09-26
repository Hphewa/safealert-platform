import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../officerNavigation';
import { listPendingOfficerReports } from '../api/officerReportsApi';
import { OfficerReportGroupCard } from '../components/OfficerReportGroupCard';
import {
  consumeReviewedOfficerReportIds,
  subscribeToReviewedOfficerReportIds
} from '../pendingReportsState';
import {
  filterOfficerGroupedReports,
  formatOfficerReportSearchSummary,
  mapSafeReportToOfficerGroupedReportSummary,
  officerReportFilterOptions,
  type OfficerGroupedReportSummary,
  type OfficerReportHazardFilter
} from '../reports';

type OfficerReportsLoadStatus = 'idle' | 'loading' | 'refreshing' | 'success' | 'error';

export function OfficerGroupedReportsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [hazardFilter, setHazardFilter] = useState<OfficerReportHazardFilter>('ALL');
  const [reports, setReports] = useState<OfficerGroupedReportSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<OfficerReportsLoadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const locallyReviewedReportIdsRef = useRef(new Set<string>());

  const removeReviewedReports = useCallback((reportIds: string[]) => {
    for (const reportId of reportIds) {
      locallyReviewedReportIdsRef.current.add(reportId);
    }

    setReports((currentReports) =>
      currentReports.filter((report) => !locallyReviewedReportIdsRef.current.has(report.id))
    );
  }, []);

  const loadReports = useCallback(
    async (isRefresh = false) => {
      if (inFlightRef.current) {
        return;
      }

      if (!accessToken) {
        setLoadStatus('error');
        setErrorMessage('Your Officer session is unavailable. Please log in again.');
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      inFlightRef.current = true;
      setLoadStatus(isRefresh ? 'refreshing' : 'loading');
      setErrorMessage(null);

      try {
        const response = await listPendingOfficerReports(accessToken);

        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        const mappedReports = response.reports.map((report) =>
          mapSafeReportToOfficerGroupedReportSummary(report)
        );

        setReports(
          mappedReports.filter((report) => !locallyReviewedReportIdsRef.current.has(report.id))
        );

        for (const reportId of locallyReviewedReportIdsRef.current) {
          if (!mappedReports.some((report) => report.id === reportId)) {
            locallyReviewedReportIdsRef.current.delete(reportId);
          }
        }
        setLoadStatus('success');
      } catch (error) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        setLoadStatus('error');
        setErrorMessage(
          error instanceof ApiClientError || error instanceof Error
            ? error.message
            : 'Unable to load pending reports right now.'
        );
      } finally {
        if (latestRequestIdRef.current === requestId) {
          inFlightRef.current = false;
        }
      }
    },
    [accessToken]
  );

  useFocusEffect(
    useCallback(() => {
      const reviewedReportIds = consumeReviewedOfficerReportIds();

      if (reviewedReportIds.length) {
        removeReviewedReports(reviewedReportIds);
      }

      void loadReports();

      return () => {
        latestRequestIdRef.current += 1;
        inFlightRef.current = false;
      };
    }, [loadReports, removeReviewedReports])
  );

  useEffect(
    () =>
      subscribeToReviewedOfficerReportIds((reportId) => {
        removeReviewedReports([reportId]);
      }),
    [removeReviewedReports]
  );

  const filteredReports = filterOfficerGroupedReports(
    reports,
    searchText,
    hazardFilter
  );
  const isLoading = loadStatus === 'loading' || loadStatus === 'refreshing';
  const isRefreshing = loadStatus === 'refreshing';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <FlatList
          contentContainerStyle={styles.content}
          data={filteredReports}
          keyExtractor={(item) => item.id}
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

                <Text style={styles.headerTitle}>Pending Reports</Text>

                <Pressable
                  accessibilityLabel="Refresh reports"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLoading }}
                  disabled={isLoading}
                  onPress={() => void loadReports(true)}
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

              <Text style={styles.description}>
                Search pending reports by location or resident description before opening a review.
              </Text>

              <View style={styles.searchCard}>
                <View style={styles.searchRow}>
                  <DashboardGlyph color={dashboardTheme.colors.muted} name="search-outline" size={18} />
                  <TextInput
                    accessibilityLabel="Search pending reports"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearchText}
                    placeholder="Search by location or report text"
                    placeholderTextColor={dashboardTheme.colors.muted}
                    style={styles.searchInput}
                    value={searchText}
                  />
                  {searchText ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      onPress={() => setSearchText('')}
                      style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.clearButtonText}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.filterRow}>
                {officerReportFilterOptions.map((filter) => {
                  const isActive = hazardFilter === filter.key;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={filter.key}
                      onPress={() => setHazardFilter(filter.key)}
                      style={[
                        styles.filterChip,
                        isActive ? styles.filterChipActive : styles.filterChipInactive
                      ]}
                    >
                      <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.summaryText}>
                {formatOfficerReportSearchSummary(filteredReports.length)}
              </Text>
              {errorMessage && reports.length ? (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>{errorMessage}</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <OfficerReportsListState
              errorMessage={errorMessage}
              hasFilters={Boolean(searchText.trim()) || hazardFilter !== 'ALL'}
              loadStatus={loadStatus}
              onRetry={() => void loadReports(true)}
            />
          }
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadReports(true)}
              refreshing={isRefreshing}
              tintColor={dashboardTheme.colors.primary}
            />
          }
          renderItem={({ item }) => <OfficerReportGroupCard report={item} />}
          showsVerticalScrollIndicator={false}
        />

        <BottomNavigation items={officerBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

function OfficerReportsListState({
  errorMessage,
  hasFilters,
  loadStatus,
  onRetry
}: {
  errorMessage: string | null;
  hasFilters: boolean;
  loadStatus: OfficerReportsLoadStatus;
  onRetry: () => void;
}) {
  const isInitialLoading =
    loadStatus === 'idle' || loadStatus === 'loading' || loadStatus === 'refreshing';
  const title = isInitialLoading
    ? 'Loading Pending Reports'
    : errorMessage
      ? 'Unable to Load Reports'
      : hasFilters
        ? 'No Matching Reports'
        : 'No Pending Reports';
  const message = isInitialLoading
    ? 'Retrieving reports awaiting official verification.'
    : errorMessage ??
      (hasFilters
        ? 'Try a different search term or hazard filter.'
        : 'There are no reports awaiting official verification right now.');

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        {isInitialLoading ? (
          <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
        ) : (
          <DashboardGlyph
            color={errorMessage ? dashboardTheme.colors.critical : dashboardTheme.colors.primaryStrong}
            name={errorMessage ? 'alert-circle-outline' : 'document-text-outline'}
            size={22}
          />
        )}
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{message}</Text>
      {errorMessage ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      ) : null}
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
  pressed: {
    opacity: 0.82
  },
  searchCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  searchInput: {
    flex: 1,
    minHeight: 24,
    fontSize: 15,
    color: dashboardTheme.colors.text
  },
  clearButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  filterChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999
  },
  filterChipActive: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  filterChipInactive: {
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surface
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  filterLabelActive: {
    color: dashboardTheme.colors.primaryStrong
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.primaryStrong
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.critical
  },
  emptyState: {
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  retryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  }
});

