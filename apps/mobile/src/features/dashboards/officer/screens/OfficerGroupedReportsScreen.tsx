import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import { officerBottomNavItems } from '../mockData';
import { OfficerReportGroupCard } from '../components/OfficerReportGroupCard';
import {
  filterOfficerGroupedReports,
  formatOfficerReportSearchSummary,
  officerGroupedReportSummaries,
  officerReportFilterOptions,
  type OfficerReportHazardFilter
} from '../reports';

export function OfficerGroupedReportsScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [hazardFilter, setHazardFilter] = useState<OfficerReportHazardFilter>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredReports = filterOfficerGroupedReports(
    officerGroupedReportSummaries,
    searchText,
    hazardFilter
  );

  const handleRefresh = () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

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

                <Text style={styles.headerTitle}>Grouped Reports</Text>

                <Pressable
                  accessibilityLabel="Refresh reports"
                  accessibilityRole="button"
                  onPress={handleRefresh}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
                </Pressable>
              </View>

              <Text style={styles.description}>
                Search pending grouped reports by location or resident description before opening a review.
              </Text>

              <View style={styles.searchCard}>
                <View style={styles.searchRow}>
                  <DashboardGlyph color={dashboardTheme.colors.muted} name="search-outline" size={18} />
                  <TextInput
                    accessibilityLabel="Search grouped reports"
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
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <DashboardGlyph
                  color={dashboardTheme.colors.primaryStrong}
                  name="document-text-outline"
                  size={22}
                />
              </View>
              <Text style={styles.emptyTitle}>No matching grouped reports</Text>
              <Text style={styles.emptyBody}>
                Try a different search term or hazard filter to review a different group.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              onRefresh={handleRefresh}
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
  }
});
