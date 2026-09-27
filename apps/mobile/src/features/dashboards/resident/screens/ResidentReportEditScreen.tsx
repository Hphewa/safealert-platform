import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HazardType,
  ReportSeverity,
  ReportVoiceEvidence,
  SafeReport,
  UpdateResidentReportRequest
} from '@safealert/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { BottomNavigation } from '../../shared/components/BottomNavigation';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { formatCoordinate } from '../../shared/currentLocation';
import { LocationPicker } from '../../shared/maps/LocationPicker';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VoiceNoteRecorder } from '../../shared/voice/VoiceNoteRecorder';
import { toReportVoiceEvidence, type LocalVoiceEvidence } from '../../shared/voice/voiceEvidence';
import { uploadReportEvidence } from '../api/mediaApi';
import { getMyReportById, updateMyPendingReport } from '../api/reportApi';
import { residentBottomNavItems } from '../mockData';
import { descriptionMaxLength, descriptionMinLength } from '../reportDraft';
import { reportGeoJsonToLocationCoordinates, type ReportLocationCoordinates } from '../reportLocation';
import {
  canPreviewResidentReportMedia,
  residentReportStatusHref,
  statusLabelForResident
} from '../reports';

const hazardOptions: Array<{ label: string; value: HazardType; icon: string }> = [
  { label: 'Flood', value: 'FLOOD', icon: 'water-outline' },
  { label: 'Blocked Road', value: 'BLOCKED_ROAD', icon: 'trail-sign-outline' },
  { label: 'Landslide', value: 'LANDSLIDE', icon: 'leaf-outline' },
  { label: 'Other', value: 'OTHER', icon: 'alert-circle-outline' }
];

const severityOptions: ReportSeverity[] = ['LOW', 'MODERATE', 'HIGH'];

type EditLoadStatus = 'loading' | 'success' | 'error';
type EditSubmitStatus = 'idle' | 'uploading' | 'saving';

type SelectedEditPhoto = {
  localUri: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedMediaReference: string | null;
};

type ResidentReportEditForm = {
  hazardType: HazardType;
  severity: ReportSeverity;
  description: string;
  coordinates: ReportLocationCoordinates;
  mediaReference?: string;
  selectedPhoto: SelectedEditPhoto | null;
  voiceEvidence?: ReportVoiceEvidence;
  selectedVoice: LocalVoiceEvidence | null;
  removeVoiceEvidence: boolean;
};

export function ResidentReportEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reportId?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const { accessToken } = useAuth();
  const [report, setReport] = useState<SafeReport | null>(null);
  const [form, setForm] = useState<ResidentReportEditForm | null>(null);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [pendingCoordinates, setPendingCoordinates] = useState<ReportLocationCoordinates | null>(null);
  const [loadStatus, setLoadStatus] = useState<EditLoadStatus>('loading');
  const [submitStatus, setSubmitStatus] = useState<EditSubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canRetrySave, setCanRetrySave] = useState(false);
  const submitInFlightRef = useRef(false);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setLoadStatus('error');
      setErrorMessage('Select a report to edit.');
      return;
    }

    if (!accessToken) {
      setLoadStatus('error');
      setErrorMessage('Your resident session is unavailable. Please log in again.');
      return;
    }

    setLoadStatus('loading');
    setErrorMessage(null);
    setCanRetrySave(false);

    try {
      const response = await getMyReportById(reportId, accessToken);
      setReport(response.report);
      setForm(createFormFromReport(response.report));
      setIsEditingLocation(false);
      setPendingCoordinates(null);
      setLoadStatus('success');
    } catch (error) {
      setLoadStatus('error');
      setErrorMessage(
        error instanceof ApiClientError || error instanceof Error
          ? error.message
          : 'Unable to load this report right now.'
      );
    }
  }, [accessToken, reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const saveChanges = async () => {
    if (!accessToken || !report || !form || submitInFlightRef.current) {
      return;
    }

    const validationMessage = validateEditForm(form);

    if (validationMessage) {
      setErrorMessage(validationMessage);
      setCanRetrySave(false);
      return;
    }

    submitInFlightRef.current = true;
    setErrorMessage(null);
    setCanRetrySave(false);

    try {
      let mediaReference = form.mediaReference;
      let voiceEvidence: ReportVoiceEvidence | null | undefined =
        form.removeVoiceEvidence ? null : form.voiceEvidence;

      if (form.selectedPhoto) {
        if (!form.selectedPhoto.uploadedMediaReference) {
          setSubmitStatus('uploading');
          const upload = await uploadReportEvidence({
            localUri: form.selectedPhoto.localUri,
            filename: form.selectedPhoto.fileName,
            mimeType: form.selectedPhoto.mimeType,
            accessToken
          });
          const uploadedMediaReference = upload.mediaReference;
          mediaReference = uploadedMediaReference;
          setForm((current) =>
            current
              ? {
                  ...current,
                  mediaReference: uploadedMediaReference,
                  selectedPhoto: current.selectedPhoto
                    ? { ...current.selectedPhoto, uploadedMediaReference: uploadedMediaReference }
                    : null
                }
              : current
          );
        } else {
          mediaReference = form.selectedPhoto.uploadedMediaReference;
        }
      }

      if (form.selectedVoice) {
        let voiceMediaReference = form.selectedVoice.uploadedMediaReference;

        if (!voiceMediaReference) {
          setSubmitStatus('uploading');
          const upload = await uploadReportEvidence({
            localUri: form.selectedVoice.localUri,
            filename: form.selectedVoice.fileName,
            mimeType: form.selectedVoice.mimeType,
            accessToken
          });
          voiceMediaReference = upload.mediaReference;
          setForm((current) =>
            current?.selectedVoice
              ? {
                  ...current,
                  selectedVoice: {
                    ...current.selectedVoice,
                    uploadedMediaReference: upload.mediaReference
                  }
                }
              : current
          );
        }

        voiceEvidence = toReportVoiceEvidence(form.selectedVoice, voiceMediaReference);
      }

      setSubmitStatus('saving');
      const payload: UpdateResidentReportRequest = {
        hazardType: form.hazardType,
        severity: form.severity,
        description: form.description.trim(),
        location: {
          type: 'Point',
          coordinates: [form.coordinates.longitude, form.coordinates.latitude]
        },
        ...(mediaReference ? { mediaReference } : {}),
        ...(voiceEvidence !== undefined ? { voiceEvidence } : {})
      };
      const response = await updateMyPendingReport(report.id, payload, accessToken);

      setReport(response.report);
      router.replace(residentReportStatusHref(response.report.id));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setErrorMessage('This report can no longer be edited because its status has changed.');
        setCanRetrySave(false);
        await loadReport();
        return;
      }

      setErrorMessage('Your changes could not be saved.');
      setCanRetrySave(true);
    } finally {
      submitInFlightRef.current = false;
      setSubmitStatus('idle');
    }
  };

  const selectPhotoFromLibrary = async () => {
    if (!form || submitStatus !== 'idle') {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setErrorMessage('Photo library permission is needed to replace photo evidence.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.82
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      setForm({
        ...form,
        selectedPhoto: {
          localUri: asset.uri,
          fileName: asset.fileName ?? null,
          mimeType: asset.mimeType ?? null,
          uploadedMediaReference: null
        }
      });
    } catch {
      setErrorMessage('We could not open your photo library. Try again.');
    }
  };

  const startEditingLocation = () => {
    if (!form) {
      return;
    }

    setPendingCoordinates(form.coordinates);
    setIsEditingLocation(true);
  };

  const cancelEditingLocation = () => {
    setPendingCoordinates(null);
    setIsEditingLocation(false);
  };

  const confirmEditedLocation = (coordinates: ReportLocationCoordinates) => {
    if (!form) {
      return;
    }

    setForm({ ...form, coordinates });
    setPendingCoordinates(null);
    setIsEditingLocation(false);
  };

  const isSubmitting = submitStatus !== 'idle';
  const mediaPreviewUri = form?.selectedPhoto?.localUri ?? resolveResidentMediaUri(form?.mediaReference);
  const currentVoiceUri = resolveMediaReferenceUri(form?.voiceEvidence?.mediaReference);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.contentWrap}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
            </Pressable>
            <Text style={styles.headerTitle}>Edit Report</Text>
            <View style={styles.headerSpacer} />
          </View>

          {loadStatus === 'loading' ? (
            <StatePanel loading message="Loading the latest persisted report." title="Loading Report" />
          ) : loadStatus === 'error' || !report || !form ? (
            <StatePanel
              actionLabel="Retry"
              message={errorMessage ?? 'Unable to load this report right now.'}
              onActionPress={() => void loadReport()}
              title="Unable to Load Report"
            />
          ) : report.status !== 'PENDING' ? (
            <StatePanel
              actionLabel="View Details"
              message="This report can no longer be edited because its status has changed."
              onActionPress={() => router.replace(residentReportStatusHref(report.id))}
              title={`${statusLabelForResident(report.status)} Report`}
            />
          ) : (
            <>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Hazard type</Text>
                <View style={styles.optionGrid}>
                  {hazardOptions.map((option) => (
                    <Pressable
                      accessibilityLabel={`${option.label} hazard type`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: form.hazardType === option.value }}
                      key={option.value}
                      onPress={() => setForm({ ...form, hazardType: option.value })}
                      style={({ pressed }) => [
                        styles.optionCard,
                        form.hazardType === option.value && styles.optionCardSelected,
                        pressed && styles.pressed
                      ]}
                    >
                      <DashboardGlyph
                        color={form.hazardType === option.value ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.muted}
                        name={option.icon}
                        size={20}
                      />
                      <Text style={styles.optionLabel}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Severity</Text>
                <View style={styles.optionRow}>
                  {severityOptions.map((severity) => (
                    <Pressable
                      accessibilityLabel={`${severity} severity`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: form.severity === severity }}
                      key={severity}
                      onPress={() => setForm({ ...form, severity })}
                      style={({ pressed }) => [
                        styles.severityChip,
                        form.severity === severity && styles.severityChipSelected,
                        pressed && styles.pressed
                      ]}
                    >
                      <Text style={styles.severityText}>{severity}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Location</Text>
                {isEditingLocation ? (
                  <LocationPicker
                    onCancel={cancelEditingLocation}
                    onChange={setPendingCoordinates}
                    onConfirm={confirmEditedLocation}
                    value={pendingCoordinates ?? form.coordinates}
                  />
                ) : (
                  <>
                    <Text style={styles.panelText}>
                      Selected location: {formatCoordinate(form.coordinates.latitude)}, {formatCoordinate(form.coordinates.longitude)}
                    </Text>
                    <LocationPreview coordinates={form.coordinates} height={210} title="Hazard location" />
                    <Pressable
                      accessibilityLabel="Adjust report location"
                      accessibilityRole="button"
                      onPress={startEditingLocation}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryButtonText}>Adjust Location</Text>
                    </Pressable>
                    <Text style={styles.hintText}>Move the pin only if the reported hazard location needs correction.</Text>
                  </>
                )}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Photo evidence</Text>
                {mediaPreviewUri && canPreviewResidentReportMedia(mediaPreviewUri) ? (
                  <Image accessibilityLabel="Report evidence preview" source={{ uri: mediaPreviewUri }} style={styles.mediaPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={24} />
                  </View>
                )}
                <Text style={styles.panelText}>
                  {form.selectedPhoto
                    ? 'New photo selected. It will upload when you save changes.'
                    : form.mediaReference
                      ? mediaPreviewUri && canPreviewResidentReportMedia(mediaPreviewUri)
                        ? 'Current uploaded evidence will be kept unless you choose a new photo.'
                        : 'Current evidence is attached, but preview is unavailable on this device.'
                      : 'No photo evidence attached.'}
                </Text>
                <Pressable
                  accessibilityLabel="Replace photo evidence"
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={() => {
                    void selectPhotoFromLibrary();
                  }}
                  style={({ pressed }) => [styles.secondaryButton, isSubmitting && styles.buttonDisabled, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryButtonText}>Replace Photo</Text>
                </Pressable>
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Voice evidence</Text>
                <Text style={styles.panelText}>Optional. Record up to 60 seconds to clarify the hazard.</Text>
                <VoiceNoteRecorder
                  disabled={isSubmitting}
                  existingVoice={
                    form.voiceEvidence && !form.removeVoiceEvidence
                      ? {
                          uri: currentVoiceUri,
                          durationSeconds: form.voiceEvidence.durationSeconds
                        }
                      : null
                  }
                  onChange={(selectedVoice) =>
                    setForm({
                      ...form,
                      selectedVoice,
                      removeVoiceEvidence: selectedVoice ? false : form.removeVoiceEvidence
                    })
                  }
                  onRemoveExisting={() =>
                    setForm({
                      ...form,
                      selectedVoice: null,
                      removeVoiceEvidence: true
                    })
                  }
                  value={form.selectedVoice}
                />
                {form.removeVoiceEvidence ? (
                  <Text style={styles.hintText}>Current voice note will be removed when you save changes.</Text>
                ) : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Description</Text>
                <TextInput
                  accessibilityLabel="Report description"
                  maxLength={descriptionMaxLength}
                  multiline
                  onChangeText={(description) => setForm({ ...form, description })}
                  placeholder="Briefly describe what you see."
                  placeholderTextColor={dashboardTheme.colors.muted}
                  style={styles.descriptionInput}
                  textAlignVertical="top"
                  value={form.description}
                />
                <Text style={styles.characterCount}>
                  {form.description.trim().length}/{descriptionMaxLength}
                </Text>
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                accessibilityLabel="Save report changes"
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
                onPress={() => {
                  void saveChanges();
                }}
                style={({ pressed }) => [styles.saveButton, isSubmitting && styles.buttonDisabled, pressed && styles.pressed]}
              >
                <Text style={styles.saveButtonText}>
                  {isSubmitting ? 'Saving changes...' : canRetrySave ? 'Try Again' : 'Save Changes'}
                </Text>
              </Pressable>

              <Text style={styles.hintText}>
                Saving updates this report only. It does not create a new report.
              </Text>
            </>
          )}
        </ScrollView>

        <BottomNavigation items={residentBottomNavItems} />
      </View>
    </SafeAreaView>
  );
}

function createFormFromReport(report: SafeReport): ResidentReportEditForm {
  const coordinates = reportGeoJsonToLocationCoordinates(report.location);

  return {
    hazardType: report.hazardType,
    severity: report.severity,
    description: report.description,
    coordinates: coordinates ?? { latitude: 0, longitude: 0 },
    ...(report.mediaReference ? { mediaReference: report.mediaReference } : {}),
    selectedPhoto: null,
    ...(report.voiceEvidence ? { voiceEvidence: report.voiceEvidence } : {}),
    selectedVoice: null,
    removeVoiceEvidence: false
  };
}

function validateEditForm(form: ResidentReportEditForm) {
  const trimmedDescription = form.description.trim();

  if (trimmedDescription.length < descriptionMinLength) {
    return `Enter at least ${descriptionMinLength} characters.`;
  }

  if (trimmedDescription.length > descriptionMaxLength) {
    return `Keep the description under ${descriptionMaxLength} characters.`;
  }

  if (
    !Number.isFinite(form.coordinates.longitude) ||
    form.coordinates.longitude < -180 ||
    form.coordinates.longitude > 180 ||
    !Number.isFinite(form.coordinates.latitude) ||
    form.coordinates.latitude < -90 ||
    form.coordinates.latitude > 90
  ) {
    return 'Choose a valid report location.';
  }

  return null;
}

function resolveResidentMediaUri(mediaReference: string | undefined) {
  return resolveMediaReferenceUri(mediaReference);
}

function StatePanel({
  title,
  message,
  actionLabel,
  onActionPress,
  loading = false
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.statePanel}>
      {loading ? (
        <ActivityIndicator color={dashboardTheme.colors.primary} size="small" />
      ) : (
        <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="alert-circle-outline" size={22} />
      )}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
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
  headerSpacer: {
    width: 44
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
  panel: {
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
  panelText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  optionCard: {
    minHeight: 54,
    minWidth: 132,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  optionCardSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  severityChip: {
    minHeight: 48,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  severityChipSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  severityText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  mediaPreview: {
    width: '100%',
    height: 200,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  photoPlaceholder: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  descriptionInput: {
    minHeight: 128,
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
  saveButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff'
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  hintText: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  statePanel: {
    gap: 12,
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  stateMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: dashboardTheme.colors.muted
  },
  buttonDisabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.82
  }
});
