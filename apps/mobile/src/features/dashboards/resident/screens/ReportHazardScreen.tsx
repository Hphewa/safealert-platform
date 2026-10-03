import { useCallback, useEffect } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import photoEvidenceIcon from '../../../../../assets/evidence/photo-evidence.png';
import voiceEvidenceIcon from '../../../../../assets/evidence/voice-evidence.png';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import {
  captureCurrentLocation as captureCurrentDeviceLocation
} from '../../shared/currentLocation';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { reverseGeocodePlace } from '../../shared/maps/locationSearch';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VoiceNoteRecorder } from '../../shared/voice/VoiceNoteRecorder';
import type { LocalVoiceEvidence } from '../../shared/voice/voiceEvidence';
import { residentBottomNavItems } from '../mockData';
import { SelectableCard } from '../components/SelectableCard';
import { hazardImageForResident } from '../reports';
import {
  descriptionMaxLength,
  type HazardSeverity,
  type HazardType,
  type PhotoEvidenceState,
  type SelectedPhotoEvidence,
  useReportHazardDraft
} from '../reportDraft';

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
  description: string;
}> = [
  {
    label: 'Low',
    value: 'LOW',
    color: dashboardTheme.colors.low,
    softColor: dashboardTheme.colors.lowSoft,
    description: 'Limited impact'
  },
  {
    label: 'Medium',
    value: 'MODERATE',
    color: dashboardTheme.colors.moderate,
    softColor: dashboardTheme.colors.moderateSoft,
    description: 'Causing disruption'
  },
  {
    label: 'High',
    value: 'HIGH',
    color: dashboardTheme.colors.critical,
    softColor: dashboardTheme.colors.criticalSoft,
    description: 'Serious danger or major disruption'
  }
];

export function ReportHazardScreen() {
  const router = useRouter();
  const { draft, setDraft, validation } = useReportHazardDraft();
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const canReviewReport = validation.isValid;

  const captureCurrentLocation = useCallback(async () => {
    setDraft((current) => ({
      ...current,
      location: {
        status: 'REQUESTING_PERMISSION',
        latitude: null,
        longitude: null,
        errorMessage: null
      }
    }));

    const nextLocationState = await captureCurrentDeviceLocation({
      permissionDeniedMessage: 'Location permission is needed to detect where this hazard is.',
      locationErrorMessage:
        'We could not detect your location. Check location services and try again.',
      onLocating: () => {
        setDraft((current) => ({
          ...current,
          location: {
            status: 'LOCATING',
            latitude: null,
            longitude: null,
            errorMessage: null
          }
        }));
      }
    });


    setDraft((current) => ({
      ...current,
      location:
        nextLocationState.status === 'DETECTED'
          ? {
              status: 'DETECTED',
              latitude: nextLocationState.latitude,
              longitude: nextLocationState.longitude,
              accuracyMeters: nextLocationState.accuracyMeters,
              capturedAt: nextLocationState.capturedAt,
              errorMessage: null
            }
          : {
              status: nextLocationState.status,
              latitude: null,
              longitude: null,
              errorMessage: nextLocationState.errorMessage
            }
    }));

  }, [setDraft]);

  useEffect(() => {
    if (draft.location.status === 'REQUESTING_PERMISSION') {
      void captureCurrentLocation();
    }
  }, [captureCurrentLocation, draft.location.status]);

  useEffect(() => {
    if (draft.location.status !== 'DETECTED') {
      setPlaceName(null);
      return;
    }

    let isCurrent = true;
    setPlaceName(null);

    void reverseGeocodePlace(draft.location.latitude, draft.location.longitude)
      .then((nextPlaceName) => {
        if (isCurrent) {
          setPlaceName(nextPlaceName ?? 'Place unavailable');
        }
      })
      .catch(() => {
        if (isCurrent) {
          setPlaceName('Place unavailable');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [
    draft.location.status,
    draft.location.status === 'DETECTED' ? draft.location.latitude : null,
    draft.location.status === 'DETECTED' ? draft.location.longitude : null
  ]);

  const setHazardType = (hazardType: HazardType) => {
    setDraft((current) => ({
      ...current,
      hazardType,
      ...(hazardType === 'OTHER' ? {} : { otherHazardType: '' })
    }));
  };

  const setOtherHazardType = (otherHazardType: string) => {
    setDraft((current) => ({ ...current, otherHazardType }));
  };

  const setSeverity = (severity: HazardSeverity) => {
    setDraft((current) => ({ ...current, severity }));
  };

  const setDescription = (description: string) => {
    setDraft((current) => ({ ...current, description }));
  };

  const trimDescription = () => {
    setDraft((current) => ({ ...current, description: current.description.trim() }));
  };

  const setPhotoState = (photoEvidence: PhotoEvidenceState) => {
    setDraft((current) => ({ ...current, photoEvidence }));
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
        mediaTypes: ['images'],
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
        mediaTypes: ['images'],
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

  const setVoiceEvidence = (voiceEvidence: LocalVoiceEvidence | null) => {
    setDraft((current) => ({
      ...current,
      voiceEvidence: voiceEvidence
        ? {
            status: 'LOCAL_SELECTED',
            selected: voiceEvidence,
            message: 'Voice note ready. It will be uploaded during report submission.'
          }
        : {
            status: 'EMPTY',
            selected: null,
            message: null
          }
    }));
  };

  const reviewReport = () => {
    setReviewAttempted(true);
    if (!canReviewReport) {
      return;
    }

    trimDescription();
    router.push('/resident/review-report');
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
              imageSource={hazardImageForResident(option.value)}
              key={option.value}
              label={option.label}
              onSelect={setHazardType}
              selected={draft.hazardType === option.value}
              value={option.value}
            />
          ))}
        </View>
        <ValidationMessage message={reviewAttempted ? validation.errors.hazardType : undefined} />
        {draft.hazardType === 'OTHER' ? (
          <View style={styles.otherHazardSection}>
            <Text style={styles.fieldLabel}>What type of hazard?</Text>
            <View style={styles.suggestionRow}>
              {['Tsunami', 'Earthquake', 'Strong winds', 'Fire'].map((suggestion) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${suggestion}`}
                  key={suggestion}
                  onPress={() => setOtherHazardType(suggestion)}
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}
                >
                  <Text style={styles.suggestionChipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              accessibilityLabel="Other hazard type"
              maxLength={80}
              onChangeText={setOtherHazardType}
              placeholder="Or type another hazard"
              placeholderTextColor={dashboardTheme.colors.muted}
              style={styles.otherHazardInput}
              value={draft.otherHazardType ?? ''}
            />
            <ValidationMessage message={reviewAttempted ? validation.errors.otherHazardType : undefined} />
          </View>
        ) : null}
      </View>

      <View style={styles.locationPanel}>
        <View style={styles.locationHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
          </View>
          <View style={styles.panelBody}>
            <Text style={styles.panelTitle}>Hazard location</Text>
          {draft.location.status === 'REQUESTING_PERMISSION' ? (
            <LocationStatusMessage message="Requesting location permission..." showSpinner />
          ) : null}
          {draft.location.status === 'LOCATING' ? (
            <LocationStatusMessage message="Detecting your current location..." showSpinner />
          ) : null}
          {draft.location.status === 'DETECTED' ? (
            <View style={styles.detectedLocation}>
              <Text style={styles.detectedText}>Location detected</Text>
              <Text style={styles.locationPlaceText}>{placeName ?? 'Finding nearby place...'}</Text>
            </View>
          ) : null}
          {draft.location.status === 'PERMISSION_DENIED' || draft.location.status === 'ERROR' ? (
            <Text style={styles.errorText}>{draft.location.errorMessage}</Text>
          ) : null}
          <ValidationMessage message={reviewAttempted ? validation.errors.location : undefined} />
          </View>
        </View>
        {draft.location.status === 'DETECTED' ? (
          <View style={styles.locationPreviewWrap}>
            <LocationPreview
              coordinates={{
                latitude: draft.location.latitude,
                longitude: draft.location.longitude
              }}
              height={128}
              title="Hazard location"
            />
          </View>
        ) : null}
        <View style={styles.locationActions}>
          {(draft.location.status === 'PERMISSION_DENIED' || draft.location.status === 'ERROR') && (
            <Pressable
              accessibilityLabel="Retry location detection"
              accessibilityRole="button"
              onPress={() => {
                void captureCurrentLocation();
              }}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryButtonText}>Retry location</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Adjust report location"
            accessibilityRole="button"
            onPress={() => router.push('/resident/adjust-report-location')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Change location</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evidence</Text>
      </View>

      <View style={styles.photoPanel}>
        <View style={styles.panelHeaderInline}>
          <View style={styles.panelIcon}>
            <Image accessibilityLabel="Photo evidence" source={photoEvidenceIcon} style={styles.evidenceIcon} />
          </View>
          <View style={styles.panelBody}>
            <Text style={styles.panelTitle}>Photo evidence</Text>
          </View>
        </View>
        {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
          <Image
            accessibilityLabel="Selected hazard evidence preview"
            source={{ uri: draft.photoEvidence.selected.localUri }}
            style={styles.photoPreview}
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            {draft.photoEvidence.status === 'REQUESTING_PERMISSION' || draft.photoEvidence.status === 'PICKING' ? (
              <ActivityIndicator color={dashboardTheme.colors.info} size="small" />
            ) : (
              <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={28} />
            )}
          </View>
        )}
        <View style={styles.photoStatus}>
          {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
            <Text style={styles.detectedText}>Photo ready</Text>
          ) : (
            <ValidationMessage
              message={
                draft.photoEvidence.status === 'PERMISSION_DENIED' || draft.photoEvidence.status === 'ERROR'
                  ? draft.photoEvidence.message ?? undefined
                  : undefined
              }
            />
          )}
        </View>
        <View style={styles.photoActions}>
          <Pressable
            accessibilityLabel={
              draft.photoEvidence.status === 'LOCAL_SELECTED' ? 'Change photo evidence' : 'Add photo evidence'
            }
            accessibilityRole="button"
            onPress={() => {
              void selectPhotoFromLibrary();
            }}
            style={({ pressed }) => [styles.addPhotoButton, pressed && styles.pressed]}
          >
            <Text style={styles.addPhotoButtonText}>
              {draft.photoEvidence.status === 'LOCAL_SELECTED' ? 'Change Photo' : 'Add Photo'}
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
          {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
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

      <View style={styles.photoPanel}>
        <View style={styles.panelHeaderInline}>
          <View style={styles.panelIcon}>
            <Image accessibilityLabel="Voice evidence" source={voiceEvidenceIcon} style={styles.evidenceIcon} />
          </View>
          <View style={styles.panelBody}>
            <Text style={styles.panelTitle}>Voice evidence</Text>
            <Text style={styles.panelText}>Up to 3 minutes</Text>
          </View>
        </View>
        <VoiceNoteRecorder
          onChange={setVoiceEvidence}
          value={draft.voiceEvidence.status === 'LOCAL_SELECTED' ? draft.voiceEvidence.selected : null}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Severity</Text>
        <View accessibilityRole="radiogroup" style={styles.severityRow}>
          {severityOptions.map((option) => {
            const selected = draft.severity === option.value;

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
                <View style={styles.severityCopy}>
                  <Text style={[styles.severityText, selected && { color: option.color }]}>
                    {option.label}
                  </Text>
                  <Text style={styles.severityHelperText}>{option.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <ValidationMessage message={reviewAttempted ? validation.errors.severity : undefined} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What can you see?</Text>
        <View style={styles.suggestionRow}>
          {(draft.hazardType === 'FLOOD'
            ? ['Water is covering part of the road.', 'Water is entering homes.', 'The water level is rising quickly.']
            : draft.hazardType === 'BLOCKED_ROAD'
              ? ['Vehicles cannot pass through this road.', 'Debris is covering the road.', 'A fallen tree is blocking the road.']
              : draft.hazardType === 'LANDSLIDE'
                ? ['Soil and rocks are covering the road.', 'The slope has collapsed.', 'More movement is still visible.']
                : ['There is visible damage in this area.', 'People may need help at this location.']).map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use description: ${suggestion}`}
              key={suggestion}
              onPress={() => setDescription(suggestion)}
              style={({ pressed }) => [styles.suggestionChip, pressed && styles.pressed]}
            >
              <Text style={styles.suggestionChipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="What can you see?"
          maxLength={descriptionMaxLength}
          multiline
          onBlur={trimDescription}
          onChangeText={setDescription}
          placeholder="Example: Water is covering both lanes and still rising."
          placeholderTextColor={dashboardTheme.colors.muted}
          style={styles.descriptionInput}
          textAlignVertical="top"
          value={draft.description}
        />
        <Text style={styles.characterCount}>
          {draft.description.trim().length}/{descriptionMaxLength}
        </Text>
        <ValidationMessage message={reviewAttempted ? validation.errors.description : undefined} />
      </View>

      <Pressable
        accessibilityLabel="Review hazard report"
        accessibilityRole="button"
        accessibilityState={{ disabled: draft.location.status === 'LOCATING' }}
        disabled={draft.location.status === 'LOCATING'}
        onPress={reviewReport}
        style={({ pressed }) => [
          styles.reviewButton,
          draft.location.status === 'LOCATING' && styles.reviewButtonDisabled,
          pressed && draft.location.status !== 'LOCATING' && styles.pressed
        ]}
      >
        <Text style={[styles.reviewButtonText, draft.location.status === 'LOCATING' && styles.reviewButtonTextDisabled]}>
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

function toSelectedPhotoEvidence(
  asset: ImagePicker.ImagePickerAsset,
  source: SelectedPhotoEvidence['source']
): SelectedPhotoEvidence {
  return {
    localUri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  otherHazardSection: {
    gap: 10,
    paddingTop: 4
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  suggestionChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: dashboardTheme.colors.primaryStrong
  },
  otherHazardInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    fontSize: 15,
    color: dashboardTheme.colors.text
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  locationPanel: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
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
  evidenceIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain'
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
  sectionHelper: {
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
    gap: 8
  },
  detectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.success
  },
  locationPlaceText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  coordinateText: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  secondaryHintText: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  locationHintText: {
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
    width: '100%',
    justifyContent: 'flex-start',
    gap: 8
  },
  locationPreviewWrap: {
    width: '100%'
  },
  secondaryButton: {
    flexGrow: 1,
    minHeight: 40,
    alignItems: 'center',
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
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
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
  photoStatus: {
    minHeight: 20,
    justifyContent: 'center'
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  panelHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  addPhotoButton: {
    flexGrow: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  removePhotoButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  severityRow: {
    flexDirection: 'row',
    gap: 10
  },
  severityOption: {
    flex: 1,
    minHeight: 78,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
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
  severityCopy: {
    flex: 1,
    gap: 2
  },
  severityHelperText: {
    fontSize: 12,
    lineHeight: 16,
    color: dashboardTheme.colors.muted
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



