import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import {
  captureCurrentLocation as captureCurrentDeviceLocation,
  formatCoordinate
} from '../../shared/currentLocation';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { ReportLocationMap } from '../components/ReportLocationMap';
import { residentBottomNavItems } from '../mockData';
import {
  applyAdjustedReportLocation,
  type ReportLocationCoordinates,
  type ReportMapRegion
} from '../reportLocation';
import { useReportHazardDraft } from '../reportDraft';

const initialLatitudeDelta = 0.01;
const initialLongitudeDelta = 0.01;

type LocationLoadState =
  | { status: 'ready'; message: string | null }
  | { status: 'locating'; message: string }
  | { status: 'error'; message: string };

export function AdjustReportLocationScreen() {
  const router = useRouter();
  const { draft, setDraft } = useReportHazardDraft();
  const [selectedLocation, setSelectedLocation] = useState<ReportLocationCoordinates | null>(() =>
    draft.location.status === 'DETECTED'
      ? { latitude: draft.location.latitude, longitude: draft.location.longitude }
      : null
  );
  const [region, setRegion] = useState<ReportMapRegion | null>(() =>
    draft.location.status === 'DETECTED'
      ? regionFromCoordinates({
          latitude: draft.location.latitude,
          longitude: draft.location.longitude
        })
      : null
  );
  const [loadState, setLoadState] = useState<LocationLoadState>(() =>
    draft.location.status === 'DETECTED'
      ? { status: 'ready', message: 'Using the location detected on the report form.' }
      : { status: 'locating', message: 'Detecting your current location...' }
  );
  const hasRequestedInitialLocation = useRef(draft.location.status === 'DETECTED');

  useEffect(() => {
    if (hasRequestedInitialLocation.current) {
      return;
    }

    hasRequestedInitialLocation.current = true;
    void locateInitialPosition();
  }, []);

  const locateInitialPosition = async () => {
    setLoadState({ status: 'locating', message: 'Detecting your current location...' });

    const location = await captureCurrentDeviceLocation({
      permissionDeniedMessage: 'Location permission is needed to adjust where this hazard is.',
      locationErrorMessage: 'We could not detect your location. Check location services and try again.'
    });

    if (location.status !== 'DETECTED') {
      setLoadState({ status: 'error', message: location.errorMessage });
      return;
    }

    const coordinates = {
      latitude: location.latitude,
      longitude: location.longitude
    };

    setSelectedLocation(coordinates);
    setRegion(regionFromCoordinates(coordinates));
    setLoadState({ status: 'ready', message: 'Using your current GPS location as the starting point.' });
  };

  const updateSelectedLocation = (coordinates: ReportLocationCoordinates) => {
    setSelectedLocation(coordinates);
    setRegion((current) => ({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      latitudeDelta: current?.latitudeDelta ?? initialLatitudeDelta,
      longitudeDelta: current?.longitudeDelta ?? initialLongitudeDelta
    }));
    setLoadState({ status: 'ready', message: 'Selected incident position updated.' });
  };

  const confirmLocation = () => {
    if (!selectedLocation) {
      return;
    }

    setDraft((current) =>
      applyAdjustedReportLocation({
        draft: current,
        coordinates: selectedLocation,
        capturedAt: new Date().toISOString()
      })
    );
    router.back();
  };

  const retryLocation = () => {
    void locateInitialPosition();
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

      <View style={styles.mapPanel}>
        {loadState.status === 'locating' ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={dashboardTheme.colors.primary} size="large" />
            <Text style={styles.panelText}>{loadState.message}</Text>
          </View>
        ) : null}

        {loadState.status === 'error' ? (
          <View style={styles.centeredState}>
            <Text style={styles.errorText}>{loadState.message}</Text>
            <Pressable
              accessibilityLabel="Retry current location"
              accessibilityRole="button"
              onPress={retryLocation}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryButtonText}>Retry Location</Text>
            </Pressable>
          </View>
        ) : null}

        {loadState.status === 'ready' && selectedLocation && region ? (
          <ReportLocationMap
            location={selectedLocation}
            onChange={updateSelectedLocation}
            onRegionChange={setRegion}
            region={region}
          />
        ) : null}
      </View>

      {selectedLocation ? (
        <View style={styles.coordinatesPanel}>
          <Text style={styles.coordinateLabel}>Selected coordinates</Text>
          <Text style={styles.coordinateText}>
            Lat {formatCoordinate(selectedLocation.latitude)}, Long{' '}
            {formatCoordinate(selectedLocation.longitude)}
          </Text>
          <Text style={styles.geoJsonHint}>Report submission keeps GeoJSON order as [longitude, latitude].</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Cancel location adjustment"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Confirm adjusted report location"
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedLocation }}
          disabled={!selectedLocation}
          onPress={confirmLocation}
          style={({ pressed }) => [
            styles.confirmButton,
            !selectedLocation && styles.confirmButtonDisabled,
            pressed && selectedLocation && styles.pressed
          ]}
        >
          <Text style={[styles.confirmButtonText, !selectedLocation && styles.confirmButtonTextDisabled]}>
            Confirm Location
          </Text>
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

function regionFromCoordinates(coordinates: ReportLocationCoordinates): ReportMapRegion {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    latitudeDelta: initialLatitudeDelta,
    longitudeDelta: initialLongitudeDelta
  };
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
  mapPanel: {
    minHeight: 360,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    ...cardShadow
  },
  centeredState: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: dashboardTheme.colors.critical
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  coordinatesPanel: {
    gap: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  coordinateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  coordinateText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  geoJsonHint: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  confirmButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  confirmButtonDisabled: {
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  confirmButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
