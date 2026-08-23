import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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

type SelectedPhotoEvidence = {
  localUri: string;
  width: number;
  height: number;
  fileName: string | null;
  mimeType: string | null;
  assetId: string | null;
  source: 'MEDIA_LIBRARY' | 'CAMERA';
  needsUpload: true;
  uploadedMediaReference: null;
};

type PhotoEvidenceState =
  | {
      status: 'EMPTY';
      selected: null;
      message: string | null;
    }
  | {
      status: 'REQUESTING_PERMISSION' | 'PICKING';
      selected: null;
      message: string;
    }
  | {
      status: 'LOCAL_SELECTED';
      selected: SelectedPhotoEvidence;
      message: string;
    }
  | {
      status: 'PERMISSION_DENIED' | 'ERROR';
      selected: null;
      message: string;
    };

type ReportHazardFormState = {
  hazardType: HazardType | null;
  location: ReportLocationState;
  photoEvidence: PhotoEvidenceState;
  severity: HazardSeverity | null;
  description: string;
};

type ReportHazardValidationErrors = Partial<
  Record<'hazardType' | 'location' | 'severity' | 'description', string>
>;

type ReportHazardValidationResult = {
  errors: ReportHazardValidationErrors;
  isValid: boolean;
};

const descriptionMaxLength = 500;

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
    status: 'EMPTY',
    selected: null,
    message: null
  },
  severity: null,
  description: ''
};

export function ReportHazardScreen() {
  const router = useRouter();
  const [formState, setFormState] = useState<ReportHazardFormState>(initialFormState);
  const validation = useMemo(() => validateReportHazardForm(formState), [formState]);
  const canReviewReport = validation.isValid;

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

  const trimDescription = () => {
    setFormState((current) => ({ ...current, description: current.description.trim() }));
  };

  const setPhotoState = (photoEvidence: PhotoEvidenceState) => {
    setFormState((current) => ({ ...current, photoEvidence }));
  };

  const selectPhotoFromLibrary = async () => {
    setPhotoState({
      status: 'REQUESTING_PERMISSION',
      selected: null,
      message: 'Requesting photo library permission...'
    });

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setPhotoState({
          status: 'PERMISSION_DENIED',
          selected: null,
          message: 'Photo library permission is needed to add optional photo evidence.'
        });
        return;
      }

      setPhotoState({
        status: 'PICKING',
        selected: null,
        message: 'Opening photo library...'
      });

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82
      });

      if (result.canceled) {
        setPhotoState({
          status: 'EMPTY',
          selected: null,
          message: 'Photo selection canceled.'
        });
        return;
      }

      setPhotoState({
        status: 'LOCAL_SELECTED',
        selected: toSelectedPhotoEvidence(result.assets[0], 'MEDIA_LIBRARY'),
        message: 'Photo selected. It will be uploaded during report submission.'
      });
    } catch {
      setPhotoState({
        status: 'ERROR',
        selected: null,
        message: 'We could not open your photo library. Try again.'
      });
    }
  };

  const capturePhotoWithCamera = async () => {
    setPhotoState({
      status: 'REQUESTING_PERMISSION',
      selected: null,
      message: 'Requesting camera permission...'
    });

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setPhotoState({
          status: 'PERMISSION_DENIED',
          selected: null,
          message: 'Camera permission is needed to take optional photo evidence.'
        });
        return;
      }

      setPhotoState({
        status: 'PICKING',
        selected: null,
        message: 'Opening camera...'
      });

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82
      });

      if (result.canceled) {
        setPhotoState({
          status: 'EMPTY',
          selected: null,
          message: 'Camera capture canceled.'
        });
        return;
      }

      setPhotoState({
        status: 'LOCAL_SELECTED',
        selected: toSelectedPhotoEvidence(result.assets[0], 'CAMERA'),
        message: 'Photo captured. It will be uploaded during report submission.'
      });
    } catch {
      setPhotoState({
        status: 'ERROR',
        selected: null,
        message: 'We could not open the camera. Try selecting a saved photo instead.'
      });
    }
  };

  const removeSelectedPhoto = () => {
    setPhotoState({
      status: 'EMPTY',
      selected: null,
      message: null
    });
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
        <ValidationMessage message={validation.errors.hazardType} />
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
          <ValidationMessage message={validation.errors.location} />
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
        {formState.photoEvidence.status === 'LOCAL_SELECTED' ? (
          <Image
            accessibilityLabel="Selected hazard evidence preview"
            source={{ uri: formState.photoEvidence.selected.localUri }}
            style={styles.photoPreview}
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            {formState.photoEvidence.status === 'REQUESTING_PERMISSION' ||
            formState.photoEvidence.status === 'PICKING' ? (
              <ActivityIndicator color={dashboardTheme.colors.info} size="small" />
            ) : (
              <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={24} />
            )}
          </View>
        )}
        <View style={styles.panelBody}>
          <Text style={styles.panelTitle}>Photo evidence</Text>
          {formState.photoEvidence.status === 'LOCAL_SELECTED' ? (
            <View style={styles.detectedLocation}>
              <Text style={styles.detectedText}>Photo ready</Text>
              <Text style={styles.panelText}>{formState.photoEvidence.message}</Text>
              <Text style={styles.mongoHintText}>
                Local image stays on this device until a media upload service stores it.
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.panelText,
                (formState.photoEvidence.status === 'PERMISSION_DENIED' ||
                  formState.photoEvidence.status === 'ERROR') &&
                  styles.errorText
              ]}
            >
              {formState.photoEvidence.message ?? 'Add an optional photo from this device.'}
            </Text>
          )}
        </View>
        <View style={styles.photoActions}>
          <Pressable
            accessibilityLabel={
              formState.photoEvidence.status === 'LOCAL_SELECTED'
                ? 'Change photo evidence'
                : 'Add photo evidence'
            }
            accessibilityRole="button"
            onPress={() => {
              void selectPhotoFromLibrary();
            }}
            style={({ pressed }) => [styles.addPhotoButton, pressed && styles.pressed]}
          >
            <Text style={styles.addPhotoButtonText}>
              {formState.photoEvidence.status === 'LOCAL_SELECTED' ? 'Change Photo' : 'Add Photo'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Take photo evidence"
            accessibilityRole="button"
            onPress={() => {
              void capturePhotoWithCamera();
            }}
            style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]}
          >
            <Text style={styles.cameraButtonText}>Take Photo</Text>
          </Pressable>
          {formState.photoEvidence.status === 'LOCAL_SELECTED' ? (
            <Pressable
              accessibilityLabel="Remove selected photo evidence"
              accessibilityRole="button"
              onPress={removeSelectedPhoto}
              style={({ pressed }) => [styles.removePhotoButton, pressed && styles.pressed]}
            >
              <Text style={styles.removePhotoButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
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
        <ValidationMessage message={validation.errors.severity} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Short description</Text>
        <TextInput
          accessibilityLabel="Short description"
          maxLength={descriptionMaxLength}
          multiline
          onBlur={trimDescription}
          onChangeText={setDescription}
          placeholder="Briefly describe what you see."
          placeholderTextColor={dashboardTheme.colors.muted}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={formState.description}
        />
        <Text style={styles.characterCount}>
          {formState.description.trim().length}/{descriptionMaxLength}
        </Text>
        <ValidationMessage message={validation.errors.description} />
      </View>

      <Pressable
        accessibilityLabel="Review hazard report"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canReviewReport }}
        disabled={!canReviewReport}
        onPress={trimDescription}
        style={({ pressed }) => [
          styles.reviewButton,
          !canReviewReport && styles.reviewButtonDisabled,
          pressed && canReviewReport && styles.pressed
        ]}
      >
        <Text style={[styles.reviewButtonText, !canReviewReport && styles.reviewButtonTextDisabled]}>
          Review Report
        </Text>
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

function ValidationMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <Text style={styles.validationText}>{message}</Text>;
}

function validateReportHazardForm(
  formState: ReportHazardFormState
): ReportHazardValidationResult {
  const errors: ReportHazardValidationErrors = {};
  const trimmedDescription = formState.description.trim();

  if (!formState.hazardType) {
    errors.hazardType = 'Select a hazard type.';
  }

  if (formState.location.status !== 'DETECTED') {
    errors.location = 'Location is required.';
  }

  if (!formState.severity) {
    errors.severity = 'Select the observed severity.';
  }

  if (!trimmedDescription) {
    errors.description = 'Enter a short description.';
  } else if (trimmedDescription.length > descriptionMaxLength) {
    errors.description = `Keep the description under ${descriptionMaxLength} characters.`;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function toSelectedPhotoEvidence(
  asset: ImagePicker.ImagePickerAsset,
  source: SelectedPhotoEvidence['source']
): SelectedPhotoEvidence {
  return {
    localUri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    assetId: asset.assetId ?? null,
    source,
    needsUpload: true,
    uploadedMediaReference: null
  };
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
  validationText: {
    fontSize: 13,
    lineHeight: 18,
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
  photoPreview: {
    width: '100%',
    minHeight: 188,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  addPhotoButton: {
    flexGrow: 1,
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
  cameraButton: {
    flexGrow: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  cameraButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  removePhotoButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#f0c6c1',
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: '#fff5f4'
  },
  removePhotoButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
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
  characterCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  reviewButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  reviewButtonDisabled: {
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  reviewButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  reviewButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
