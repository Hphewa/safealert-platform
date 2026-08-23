import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { residentBottomNavItems } from '../mockData';
import { SelectableCard } from '../components/SelectableCard';

type HazardType = 'FLOOD' | 'BLOCKED_ROAD' | 'LANDSLIDE' | 'OTHER';
type HazardSeverity = 'LOW' | 'MODERATE' | 'HIGH';

type ReportLocationState =
  | {
      status: 'REQUESTING_PERMISSION' | 'LOCATING';
      latitude: null;
      longitude: null;
      errorMessage: null;
    }
  | {
      status: 'DETECTED';
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      capturedAt: string;
      errorMessage: null;
    }
  | {
      status: 'PERMISSION_DENIED' | 'ERROR';
      latitude: null;
      longitude: null;
      errorMessage: string;
    };

type ReportHazardFormState = {
  hazardType: HazardType | null;
  location: ReportLocationState;
  photoEvidence: {
    status: 'PENDING_PHOTO_PICKER';
    assets: Array<{
      uri: string;
      id?: string;
    }>;
  };
  severity: HazardSeverity | null;
  description: string;
};

const hazardTypeOptions: Array<{
  label: string;
  value: HazardType;
  icon: string;
}> = [
  { label: 'Flood', value: 'FLOOD', icon: 'water-outline' },
  { label: 'Blocked Road', value: 'BLOCKED_ROAD', icon: 'trail-sign-outline' },
  { label: 'Landslide', value: 'LANDSLIDE', icon: 'leaf-outline' },
  { label: 'Other', value: 'OTHER', icon: 'alert-circle-outline' }
];

const severityOptions: Array<{
  label: string;
  value: HazardSeverity;
  color: string;
  softColor: string;
}> = [
  {
    label: 'Low',
    value: 'LOW',
    color: dashboardTheme.colors.low,
    softColor: dashboardTheme.colors.lowSoft
  },
  {
    label: 'Moderate',
    value: 'MODERATE',
    color: dashboardTheme.colors.moderate,
    softColor: dashboardTheme.colors.moderateSoft
  },
  {
    label: 'High',
    value: 'HIGH',
    color: dashboardTheme.colors.high,
    softColor: dashboardTheme.colors.highSoft
  }
];

const initialFormState: ReportHazardFormState = {
  hazardType: null,
  location: {
    status: 'REQUESTING_PERMISSION',
    latitude: null,
    longitude: null,
    errorMessage: null
  },
  photoEvidence: {
    status: 'PENDING_PHOTO_PICKER',
    assets: []
  },
  severity: null,
  description: ''
};

export function ReportHazardScreen() {
  const router = useRouter();
  const [formState, setFormState] = useState<ReportHazardFormState>(initialFormState);

  const captureCurrentLocation = useCallback(async () => {
    setFormState((current) => ({
      ...current,
      location: {
        status: 'REQUESTING_PERMISSION',
        latitude: null,
        longitude: null,
        errorMessage: null
      }
    }));

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setFormState((current) => ({
          ...current,
          location: {
            status: 'PERMISSION_DENIED',
            latitude: null,
            longitude: null,
            errorMessage: 'Location permission is needed to detect where this hazard is.'
          }
        }));
        return;
      }

      setFormState((current) => ({
        ...current,
        location: {
          status: 'LOCATING',
          latitude: null,
          longitude: null,
          errorMessage: null
        }
      }));

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setFormState((current) => ({
        ...current,
        location: {
          status: 'DETECTED',
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          accuracyMeters: currentLocation.coords.accuracy,
          capturedAt: new Date(currentLocation.timestamp).toISOString(),
          errorMessage: null
        }
      }));
    } catch {
      setFormState((current) => ({
        ...current,
        location: {
          status: 'ERROR',
          latitude: null,
          longitude: null,
          errorMessage: 'We could not detect your location. Check location services and try again.'
        }
      }));
    }
  }, []);

  useEffect(() => {
    void captureCurrentLocation();
  }, [captureCurrentLocation]);

  const setHazardType = (hazardType: HazardType) => {
    setFormState((current) => ({ ...current, hazardType }));
  };

  const setSeverity = (severity: HazardSeverity) => {
    setFormState((current) => ({ ...current, severity }));
  };

  const setDescription = (description: string) => {
    setFormState((current) => ({ ...current, description }));
  };

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
        <Text style={styles.headerTitle}>Report Hazard</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hazard type</Text>
        <View accessibilityRole="radiogroup" style={styles.optionGrid}>
          {hazardTypeOptions.map((option) => (
            <SelectableCard
              icon={option.icon}
              key={option.value}
              label={option.label}
              onSelect={setHazardType}
              selected={formState.hazardType === option.value}
              value={option.value}
            />
          ))}
        </View>
      </View>

      <View style={styles.locationPanel}>
        <View style={styles.panelIcon}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
        </View>
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Location</Text>
          {formState.location.status === 'REQUESTING_PERMISSION' ? (
            <LocationStatusMessage message="Requesting location permission..." showSpinner />
          ) : null}
          {formState.location.status === 'LOCATING' ? (
            <LocationStatusMessage message="Detecting your current location..." showSpinner />
          ) : null}
          {formState.location.status === 'DETECTED' ? (
            <View style={styles.detectedLocation}>
              <Text style={styles.detectedText}>Detected current location</Text>
              <Text style={styles.coordinateText}>
                Lat {formatCoordinate(formState.location.latitude)}, Long{' '}
                {formatCoordinate(formState.location.longitude)}
              </Text>
              <Text style={styles.mongoHintText}>Saved for reports as [longitude, latitude].</Text>
            </View>
          ) : null}
          {formState.location.status === 'PERMISSION_DENIED' ||
          formState.location.status === 'ERROR' ? (
            <Text style={styles.errorText}>{formState.location.errorMessage}</Text>
          ) : null}
        </View>
        <View style={styles.locationActions}>
          {(formState.location.status === 'PERMISSION_DENIED' ||
            formState.location.status === 'ERROR') && (
            <Pressable
              accessibilityLabel="Retry location detection"
              accessibilityRole="button"
              onPress={() => {
                void captureCurrentLocation();
              }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Adjust report location"
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Adjust Location</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.photoPanel}>
        <View style={styles.photoPlaceholder}>
          <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={24} />
        </View>
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Photo evidence</Text>
          <Text style={styles.panelText}>Photo upload will be connected in a later step.</Text>
        </View>
        <Pressable
          accessibilityLabel="Add photo evidence"
          accessibilityRole="button"
          onPress={() => undefined}
          style={({ pressed }) => [styles.addPhotoButton, pressed && styles.pressed]}
        >
          <Text style={styles.addPhotoButtonText}>Add Photo</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Severity</Text>
        <View accessibilityRole="radiogroup" style={styles.severityRow}>
          {severityOptions.map((option) => {
            const selected = formState.severity === option.value;

            return (
              <Pressable
                accessibilityLabel={`${option.label} severity`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={option.value}
                onPress={() => setSeverity(option.value)}
                style={({ pressed }) => [
                  styles.severityOption,
                  selected && {
                    borderColor: option.color,
                    backgroundColor: option.softColor
                  },
                  pressed && styles.pressed
                ]}
              >
                <View style={[styles.severityDot, { backgroundColor: option.color }]} />
                <Text style={[styles.severityText, selected && { color: option.color }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Short description</Text>
        <TextInput
          accessibilityLabel="Short description"
          multiline
          onChangeText={setDescription}
          placeholder="Briefly describe what you see."
          placeholderTextColor={dashboardTheme.colors.muted}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={formState.description}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => undefined}
        style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}
      >
        <Text style={styles.reviewButtonText}>Review Report</Text>
      </Pressable>
    </DashboardScreen>
  );
}

function LocationStatusMessage({ message, showSpinner }: { message: string; showSpinner?: boolean }) {
  return (
    <View style={styles.statusRow}>
      {showSpinner ? <ActivityIndicator color={dashboardTheme.colors.primary} size="small" /> : null}
      <Text style={styles.panelText}>{message}</Text>
    </View>
  );
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
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
  section: {
    gap: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  locationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  photoPanel: {
    gap: 14,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detectedLocation: {
    gap: 3
  },
  detectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.success
  },
  coordinateText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
  },
  mongoHintText: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  locationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8
  },
  secondaryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  retryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0c6c1',
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: '#fff5f4'
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  photoPlaceholder: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  addPhotoButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.info,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  addPhotoButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.info
  },
  severityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  severityOption: {
    flexGrow: 1,
    minHeight: 52,
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  severityText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  descriptionInput: {
    minHeight: 124,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    fontSize: 16,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  reviewButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  reviewButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.82
  }
});
