import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { LocationPicker } from '../../shared/maps/LocationPicker';
import type { LocationSelectionMetadata } from '../../shared/maps/types';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { residentBottomNavItems } from '../mockData';
import {
  applyAdjustedReportLocation,
  locationSelectionCapturedAt,
  type ReportLocationCoordinates
} from '../reportLocation';
import { useReportHazardDraft } from '../reportDraft';

export function AdjustReportLocationScreen() {
  const router = useRouter();
  const { draft, setDraft } = useReportHazardDraft();
  const [selectedLocation, setSelectedLocation] = useState<ReportLocationCoordinates | null>(() =>
    draft.location.status === 'DETECTED'
      ? { latitude: draft.location.latitude, longitude: draft.location.longitude }
      : null
  );

  const confirmLocation = (
    coordinates: ReportLocationCoordinates,
    metadata: LocationSelectionMetadata | undefined
  ) => {
    setDraft((current) =>
      applyAdjustedReportLocation({
        draft: current,
        coordinates,
        capturedAt: locationSelectionCapturedAt(metadata),
        accuracyMeters: metadata?.accuracyMeters
      })
    );
    router.back();
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Cancel location adjustment"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Adjust Location</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.instructionPanel}>
        <View style={styles.panelIcon}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="map-outline" size={20} />
        </View>
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Incident position</Text>
          <Text style={styles.panelText}>
            Move the pin to the hazard location. Confirming only updates this report draft.
          </Text>
        </View>
      </View>

      <LocationPicker
        onCancel={() => router.back()}
        onChange={setSelectedLocation}
        onConfirm={confirmLocation}
        value={selectedLocation}
      />
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
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  instructionPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  panelIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  panelBody: {
    flex: 1,
    gap: 4
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  panelText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
