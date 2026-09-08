import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { residentBottomNavItems } from '../mockData';
import { useReportHazardDraft } from '../reportDraft';

export function ReportStatusPlaceholderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string }>();
  const { submittedReport } = useReportHazardDraft();
  const reportId = params.reportId ?? submittedReport?.id ?? 'Pending report';

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Track Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="document-text-outline" size={24} />
        </View>
        <Text style={styles.title}>Report tracking is coming next.</Text>
        <Text style={styles.bodyText}>Report ID: {reportId}</Text>
        <Text style={styles.bodyText}>Full report status and history will be added during LDFEW-103.</Text>
      </View>

      <Pressable
        accessibilityLabel="Return to resident dashboard"
        accessibilityRole="button"
        onPress={() => router.push('/resident')}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryButtonText}>Back to Home</Text>
      </Pressable>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 22,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  panel: {
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  iconWrap: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
