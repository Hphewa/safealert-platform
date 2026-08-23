import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import { volunteerBottomNavItems } from '../mockData';
import { VolunteerReportCard } from '../components/VolunteerReportCard';
import { VolunteerReportTabs } from '../components/VolunteerReportTabs';
import {
  volunteerCommunityReportsMockData,
  volunteerCommunityReportTabs,
  type VolunteerReportListKey
} from '../reports';

export function VolunteerCommunityReportsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<VolunteerReportListKey>('nearby');
  const [refreshCount, setRefreshCount] = useState(0);

  const reports = useMemo(() => volunteerCommunityReportsMockData[activeTab], [activeTab]);

  const refreshSummary =
    refreshCount > 0 ? `Preview refreshed ${refreshCount} time${refreshCount === 1 ? '' : 's'}.` : 'Mock preview data only for this step.';

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
                  onPress={() => setRefreshCount((current) => current + 1)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <DashboardGlyph color={dashboardTheme.colors.text} name="refresh-outline" size={18} />
                </Pressable>
              </View>

              <Text style={styles.description}>
                Review nearby community submissions and incoming items awaiting volunteer attention.
              </Text>
              <Text style={styles.refreshSummary}>{refreshSummary}</Text>

              <VolunteerReportTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                tabs={volunteerCommunityReportTabs}
              />
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
      <Text style={styles.emptyTitle}>No preview reports</Text>
      <Text style={styles.emptyBody}>Volunteer report details for this tab will appear here once mock data is added.</Text>
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
  pressed: {
    opacity: 0.82
  }
});
