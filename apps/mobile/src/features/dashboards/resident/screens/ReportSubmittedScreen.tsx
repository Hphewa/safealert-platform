import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import hazardFallbackImage from '../../../../../assets/hazards/other.png';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { reverseGeocodePlace } from '../../shared/maps/locationSearch';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { residentBottomNavItems } from '../mockData';
import { severityLabels, useReportHazardDraft } from '../reportDraft';
import { hazardImageForResident, hazardLabelForResident, statusLabelForResident } from '../reports';
import { residentReportStatusHref } from '../reports';

export function ReportSubmittedScreen() {
  const router = useRouter();
  const { submittedReport } = useReportHazardDraft();
  const [locationPlace, setLocationPlace] = useState<string | null>(null);

  useEffect(() => {
    if (!submittedReport) {
      setLocationPlace(null);
      return;
    }

    let isCurrent = true;
    void reverseGeocodePlace(submittedReport.location.coordinates[1], submittedReport.location.coordinates[0]).then(
      (place) => {
        if (isCurrent) {
          setLocationPlace(place ?? 'Location recorded');
        }
      }
    );

    return () => {
      isCurrent = false;
    };
  }, [submittedReport]);

  const trackReport = () => {
    if (submittedReport) {
      router.push(residentReportStatusHref(submittedReport.id));
      return;
    }

    router.push('/resident/reports');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>Report Submitted</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.successPanel}>
        <View style={styles.successIcon}>
          <DashboardGlyph color={dashboardTheme.colors.success} name="checkmark-done-outline" size={24} />
        </View>
        <Text style={styles.successTitle}>Report Submitted Successfully!</Text>
        <Text style={styles.successText}>Your report is now waiting for review.</Text>
      </View>

      {submittedReport ? (
        <>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Next step</Text>
            <Text style={styles.statusValue}>{statusLabelForResident(submittedReport.status)}</Text>
            <Text style={styles.statusHint}>You can follow progress from My Reports.</Text>
          </View>

          <View style={styles.summaryPanel}>
            <View style={styles.summaryHeader}>
              <Image
                accessibilityLabel="Submitted hazard icon"
                source={hazardImageForResident(submittedReport.hazardType) ?? hazardFallbackImage}
                style={styles.hazardIcon}
              />
              <Text style={styles.panelTitle}>Submission details</Text>
            </View>
            <SubmittedDetail label="Hazard" value={hazardLabelForResident(submittedReport.hazardType, submittedReport.otherHazardType)} />
            <SubmittedDetail label="Severity" value={severityLabels[submittedReport.severity]} />
            <SubmittedDetail
              label="Location"
              value={locationPlace ?? 'Finding location...'}
            />
          </View>
        </>
      ) : (
        <View style={styles.summaryPanel}>
          <Text style={styles.panelTitle}>Submission details</Text>
          <Text style={styles.helperText}>No confirmed report details are available in this session.</Text>
        </View>
      )}

      <View style={styles.confirmationPanel}>
        <View style={styles.connectionDot} />
        <Text style={styles.helperText}>
          SafeAlert will show updates in My Reports.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Track submitted report"
          accessibilityRole="button"
          onPress={trackReport}
          style={({ pressed }) => [styles.trackButton, pressed && styles.pressed]}
        >
          <Text style={styles.trackButtonText}>Track Report</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Return to resident dashboard"
          accessibilityRole="button"
          onPress={() => router.push('/resident')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

function SubmittedDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
  successPanel: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  successIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: dashboardTheme.colors.successSoft
  },
  successTitle: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  statusCard: {
    gap: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.moderate,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.moderateSoft,
    ...cardShadow
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.moderate
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  statusHint: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  summaryPanel: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  hazardIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.primarySoft,
    resizeMode: 'contain'
  },
  detailRow: {
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  helperText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  confirmationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dashboardTheme.colors.success
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  trackButton: {
    flexGrow: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  trackButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  primaryButton: {
    flexGrow: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
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
