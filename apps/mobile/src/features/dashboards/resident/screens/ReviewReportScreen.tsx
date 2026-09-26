import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { createResidentReport } from '../api/reportApi';
import { uploadReportEvidence } from '../api/mediaApi';
import { residentBottomNavItems } from '../mockData';
import {
  hazardTypeLabels,
  severityLabels,
  useReportHazardDraft,
  type ReportHazardDraft
} from '../reportDraft';
import {
  beginReportSubmission,
  canSubmitReport,
  clearReportSubmission,
  isReportSubmissionActive
} from '../reportSubmissionGuard';
import { ReportSubmissionError, submitResidentReportDraft } from '../reportSubmission';

const connectionStatus = 'Online';

type SubmitState = {
  status: 'idle' | 'uploading' | 'submitting' | 'error';
  reason?: 'validation' | 'auth' | 'network' | 'upload' | 'server';
  message: string | null;
};

export function ReviewReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { draft, resetDraft, setDraft, setSubmittedReport, validation } = useReportHazardDraft();
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle', message: null });
  const submitInFlightRef = useRef(false);
  const isSubmitting = isReportSubmissionActive(submitState.status);
  const canSubmit = canSubmitReport({ isValid: validation.isValid, status: submitState.status });

  const editReport = () => {
    router.push('/resident/report-hazard');
  };

  const submitReport = async () => {
    if (isSubmitting) {
      return;
    }

    if (!validation.isValid || !draft.hazardType || !draft.severity || draft.location.status !== 'DETECTED') {
      setSubmitState({
        status: 'error',
        reason: 'validation',
        message: 'Please fix the highlighted report details before submitting.'
      });
      return;
    }

    if (!accessToken) {
      setSubmitState({
        status: 'error',
        reason: 'auth',
        message: 'Your session has expired. Please log in again before submitting.'
      });
      return;
    }

    if (!beginReportSubmission(submitInFlightRef, isSubmitting)) {
      return;
    }

    setSubmittedReport(null);
    setSubmitState(photoNeedsUpload(draft) ? { status: 'uploading', message: null } : { status: 'submitting', message: null });

    try {
      const result = await submitResidentReportDraft({
        draft,
        accessToken,
        uploadReportEvidence,
        createResidentReport,
        onEvidenceUploaded: (mediaReference) => {
          setDraft((current) => {
            if (current.photoEvidence.status !== 'LOCAL_SELECTED') {
              return current;
            }

            return {
              ...current,
              photoEvidence: {
                ...current.photoEvidence,
                selected: {
                  ...current.photoEvidence.selected,
                  needsUpload: false,
                  uploadedMediaReference: mediaReference
                },
                message: 'Photo evidence uploaded. It will be attached when this report is submitted.'
              }
            };
          });
          setSubmitState({ status: 'submitting', message: null });
        }
      });
      setSubmittedReport(result.response.report);
      resetDraft();
      router.replace('/resident/report-submitted');
    } catch (error) {
      clearReportSubmission(submitInFlightRef);
      setSubmitState({
        status: 'error',
        ...submitErrorStateFor(error)
      });
    }
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
        <Text style={styles.headerTitle}>Review Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.introText}>Please check your report before submitting.</Text>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="warning-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Hazard</Text>
        </View>
        <View style={styles.detailGrid}>
          <ReviewDetail
            label="Hazard type"
            value={draft.hazardType ? hazardTypeLabels[draft.hazardType] : 'Not selected'}
          />
          <ReviewDetail
            label="Severity"
            value={draft.severity ? severityLabels[draft.severity] : 'Not selected'}
          />
        </View>
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Location</Text>
        </View>
        {draft.location.status === 'DETECTED' ? (
          <View style={styles.locationPreview}>
            <Text style={styles.locationPreviewTitle}>Hazard location</Text>
            <Text style={styles.coordinateText}>Latitude {formatCoordinate(draft.location.latitude)}</Text>
            <Text style={styles.coordinateText}>Longitude {formatCoordinate(draft.location.longitude)}</Text>
            <LocationPreview
              coordinates={{
                latitude: draft.location.latitude,
                longitude: draft.location.longitude
              }}
              height={168}
              title="Hazard location"
            />
            <Text style={styles.helperText}>Edit the report if this pin is not where the hazard is.</Text>
          </View>
        ) : (
          <Text style={styles.errorText}>Location is required.</Text>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIconMuted}>
            <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Photo</Text>
        </View>
        {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
          <View style={styles.photoSummary}>
            <Image
              accessibilityLabel="Selected hazard evidence preview"
              source={{ uri: draft.photoEvidence.selected.localUri }}
              style={styles.photoPreview}
            />
            <Text style={styles.helperText}>
              {draft.photoEvidence.selected.uploadedMediaReference
                ? 'Photo evidence has been uploaded and will be attached to this report.'
                : 'Photo selected locally. It will upload before the report is submitted.'}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyPhotoState}>
            <DashboardGlyph color={dashboardTheme.colors.muted} name="camera-outline" size={22} />
            <Text style={styles.helperText}>No photo was added.</Text>
          </View>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIconMuted}>
            <DashboardGlyph color={dashboardTheme.colors.info} name="document-text-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Description</Text>
        </View>
        <Text style={styles.descriptionText}>{draft.description.trim() || 'No description entered.'}</Text>
      </View>

      <View style={styles.connectionPanel}>
        <View style={styles.connectionDot} />
        <View style={styles.connectionTextWrap}>
          <Text style={styles.connectionTitle}>Connection status</Text>
          <Text style={styles.helperText}>
            {submitState.reason === 'network'
              ? 'Connection problem detected. Your draft is still saved on this screen.'
              : `${connectionStatus}. Offline sync will be added later.`}
          </Text>
        </View>
      </View>

      {!validation.isValid ? (
        <View style={styles.validationPanel}>
          {Object.values(validation.errors).map((message) => (
            <Text key={message} style={styles.errorText}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      {submitState.status === 'error' ? (
        <View style={styles.validationPanel}>
          <Text style={styles.errorText}>{submitState.message}</Text>
          {submitState.reason === 'network' ||
          submitState.reason === 'upload' ||
          submitState.reason === 'validation' ||
          submitState.reason === 'server' ? (
            <Pressable
              accessibilityLabel="Retry report submission"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => {
                void submitReport();
              }}
              style={({ pressed }) => [styles.retrySubmitButton, pressed && styles.pressed]}
            >
              <Text style={styles.retrySubmitButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Edit hazard report"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={editReport}
          style={({ pressed }) => [
            styles.editButton,
            isSubmitting && styles.editButtonDisabled,
            pressed && !isSubmitting && styles.pressed
          ]}
        >
          <Text style={[styles.editButtonText, isSubmitting && styles.editButtonTextDisabled]}>Edit Report</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Submit hazard report"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => {
            void submitReport();
          }}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
            pressed && canSubmit && styles.pressed
          ]}
        >
          {isSubmitting ? (
            <View style={styles.submitProgress}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.submitButtonText}>
                {submitState.status === 'uploading' ? 'Uploading evidence...' : 'Submitting report...'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
              {submitState.status === 'error' ? 'Try Submit Again' : 'Submit Report'}
            </Text>
          )}
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function submitErrorStateFor(error: unknown): Pick<SubmitState, 'reason' | 'message'> {
  if (error instanceof ReportSubmissionError) {
    return submitErrorStateForStage(error);
  }

  if (error instanceof ApiClientError) {
    if (error.status === 0) {
      return {
        reason: 'network',
        message: 'Could not submit the report. Check your connection and try again.'
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        reason: 'auth',
        message: 'Your session could not submit this report. Please log in again.'
      };
    }

    if (error.status === 400) {
      return {
        reason: 'validation',
        message: 'Some report details are invalid. Please edit the report and try again.'
      };
    }

    if (error.status === 413 || error.status === 415) {
      return {
        reason: 'upload',
        message: 'That photo could not be uploaded. Choose a supported JPG or PNG and try again.'
      };
    }

    return {
      reason: 'server',
      message: 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.'
    };
  }

  return {
    reason: 'server',
    message: 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.'
  };
}

function submitErrorStateForStage(error: ReportSubmissionError): Pick<SubmitState, 'reason' | 'message'> {
  const originalError = error.originalError;

  if (originalError instanceof ApiClientError) {
    if (originalError.status === 401 || originalError.status === 403) {
      return {
        reason: 'auth',
        message: 'Your session could not submit this report. Please log in again.'
      };
    }

    if (error.stage === 'upload') {
      if (originalError.status === 0) {
        return {
          reason: 'network',
          message: "Couldn't upload the photo. Check your connection and try again."
        };
      }

      return {
        reason: 'upload',
        message: uploadFailureMessageFor(originalError)
      };
    }

    if (originalError.status === 0) {
      return {
        reason: 'network',
        message: error.mediaReference
          ? 'Your photo was uploaded, but the report could not be submitted. Check your connection and try again.'
          : 'Could not submit the report. Check your connection and try again.'
      };
    }

    return {
      reason: originalError.status === 400 ? 'validation' : 'server',
      message: error.mediaReference
        ? 'Your photo was uploaded, but the report could not be submitted. Try again.'
        : reportCreateFailureMessageFor(originalError)
    };
  }

  if (error.stage === 'upload') {
    return {
      reason: 'upload',
      message: "Couldn't upload the photo. Try again."
    };
  }

  return {
    reason: 'server',
    message: error.mediaReference
      ? 'Your photo was uploaded, but the report could not be submitted. Try again.'
      : 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.'
  };
}

function uploadFailureMessageFor(error: ApiClientError) {
  if (error.status === 413) {
    return 'That photo is too large to upload. Choose a smaller image and try again.';
  }

  if (error.status === 415) {
    return 'That photo format is not supported. Choose a JPG or PNG and try again.';
  }

  if (error.status === 400) {
    return 'That photo could not be uploaded. Choose a supported JPG or PNG and try again.';
  }

  return "Couldn't upload the photo right now. Try again.";
}

function reportCreateFailureMessageFor(error: ApiClientError) {
  if (error.status === 400) {
    return 'Some report details are invalid. Please edit the report and try again.';
  }

  return 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.';
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function photoNeedsUpload(draft: ReportHazardDraft) {
  return (
    draft.photoEvidence.status === 'LOCAL_SELECTED' &&
    !draft.photoEvidence.selected.uploadedMediaReference
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
  introText: {
    fontSize: 16,
    lineHeight: 23,
    color: dashboardTheme.colors.muted
  },
  summaryPanel: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  panelIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  panelIconMuted: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  panelTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  detailItem: {
    flexGrow: 1,
    minWidth: 128,
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
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  locationPreview: {
    gap: 5,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  locationPreviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  coordinateText: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.text
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  photoSummary: {
    gap: 10
  },
  photoPreview: {
    width: '100%',
    minHeight: 188,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  emptyPhotoState: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  connectionPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: dashboardTheme.colors.success
  },
  connectionTextWrap: {
    flex: 1,
    gap: 2
  },
  connectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  validationPanel: {
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  retrySubmitButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  retrySubmitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  editButton: {
    flexGrow: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  editButtonDisabled: {
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  editButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  submitButton: {
    flexGrow: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  submitButtonDisabled: {
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  submitButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  submitProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pressed: {
    opacity: 0.82
  }
});

