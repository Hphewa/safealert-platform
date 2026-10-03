import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import photoEvidenceIcon from '../../../../../assets/evidence/photo-evidence.png';
import voiceEvidenceIcon from '../../../../../assets/evidence/voice-evidence.png';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { LocationPreview } from '../../shared/maps/LocationPreview';
import { reverseGeocodePlace } from '../../shared/maps/locationSearch';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { VoiceNotePlayer } from '../../shared/voice/VoiceNotePlayer';
import { createResidentReport } from '../api/reportApi';
import { uploadReportEvidence } from '../api/mediaApi';
import { residentBottomNavItems } from '../mockData';
import {
  severityLabels,
  useReportHazardDraft,
  type ReportHazardDraft
} from '../reportDraft';
import { hazardImageForResident, hazardLabelForResident } from '../reports';
import {
  beginReportSubmission,
  canSubmitReport,
  clearReportSubmission,
  isReportSubmissionActive
} from '../reportSubmissionGuard';
import { ReportSubmissionError, submitResidentReportDraft } from '../reportSubmission';
import {
  clearPersistedReportDraft,
  createReportOperationId,
  enqueueReportSubmission,
  listQueuedReports,
  removeQueuedReport
} from '../offlineReportQueue';
import { prepareDraftForOffline } from '../offlineEvidence';

type SubmitState = {
  status: 'idle' | 'uploading' | 'submitting' | 'error';
  reason?: 'validation' | 'auth' | 'network' | 'upload' | 'server';
  message: string | null;
};

export function ReviewReportScreen() {
  const router = useRouter();
  const { offlineReportId: offlineReportIdParam, operationId: operationIdParam } = useLocalSearchParams<{
    offlineReportId?: string;
    operationId?: string;
  }>();
  const { accessToken, user } = useAuth();
  const { draft, resetDraft, setDraft, setSubmittedReport, validation } = useReportHazardDraft();
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle', message: null });
  const [locationPlace, setLocationPlace] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const operationIdRef = useRef(
    typeof operationIdParam === 'string' ? operationIdParam : createReportOperationId()
  );
  const offlineReportId = typeof offlineReportIdParam === 'string' ? offlineReportIdParam : null;
  const isSubmitting = isReportSubmissionActive(submitState.status);
  const canSubmit = canSubmitReport({ isValid: validation.isValid, status: submitState.status });

  useEffect(() => {
    if (!offlineReportId || !user?.id) return;

    let isCurrent = true;
    void listQueuedReports(user.id).then((items) => {
      const queuedReport = items.find((item) => item.id === offlineReportId);
      if (isCurrent && queuedReport) setDraft(queuedReport.draft);
    });

    return () => {
      isCurrent = false;
    };
  }, [offlineReportId, setDraft, user?.id]);

  useEffect(() => {
    if (draft.location.status !== 'DETECTED') {
      setLocationPlace(null);
      return;
    }

    let isCurrent = true;
    setLocationPlace(null);
    void reverseGeocodePlace(draft.location.latitude, draft.location.longitude).then((place) => {
      if (isCurrent) {
        setLocationPlace(place ?? 'Location detected');
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [draft.location.status, draft.location.latitude, draft.location.longitude]);

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
    setSubmitState(evidenceNeedsUpload(draft) ? { status: 'uploading', message: null } : { status: 'submitting', message: null });

    try {
      const result = await submitResidentReportDraft({
        draft,
        accessToken,
        clientOperationId: operationIdRef.current,
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
        },
        onVoiceEvidenceUploaded: (mediaReference) => {
          setDraft((current) => {
            if (current.voiceEvidence.status !== 'LOCAL_SELECTED') {
              return current;
            }

            return {
              ...current,
              voiceEvidence: {
                ...current.voiceEvidence,
                selected: {
                  ...current.voiceEvidence.selected,
                  uploadedMediaReference: mediaReference
                },
                message: 'Voice note uploaded. It will be attached when this report is submitted.'
              }
            };
          });
          setSubmitState({ status: 'submitting', message: null });
        }
      });
      setSubmittedReport(result.response.report);
      if (offlineReportId && user?.id) {
        await removeQueuedReport(user.id, offlineReportId);
      }
      resetDraft();
      router.replace('/resident/report-submitted');
    } catch (error) {
      clearReportSubmission(submitInFlightRef);
      const errorState = submitErrorStateFor(error);

      if (errorState.reason === 'network' && user?.id) {
          const offlineDraft = await prepareDraftForOffline(draft, operationIdRef.current);
          await enqueueReportSubmission(user.id, offlineDraft, operationIdRef.current);
        await clearPersistedReportDraft(user.id);
        setSubmitState({
          status: 'error',
          reason: 'network',
          message: 'Saved offline. SafeAlert will submit this report when you are connected again.'
        });
        return;
      }

      setSubmitState({ status: 'error', ...errorState });
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
            {draft.hazardType ? (
              <Image
                accessibilityLabel="Hazard type icon"
                source={hazardImageForResident(draft.hazardType)}
                style={styles.summaryIconImage}
              />
            ) : (
              <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="warning-outline" size={20} />
            )}
          </View>
          <Text style={styles.panelTitle}>Hazard report</Text>
        </View>
        <View style={styles.detailGrid}>
          <ReviewDetail
            label="Hazard type"
            value={draft.hazardType ? hazardLabelForResident(draft.hazardType, draft.otherHazardType) : 'Not selected'}
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
          <Text style={styles.panelTitle}>Hazard location</Text>
        </View>
        {draft.location.status === 'DETECTED' ? (
          <View style={styles.locationPreview}>
            <Text style={styles.locationPlaceText}>{locationPlace ?? 'Finding location...'}</Text>
            <LocationPreview
              coordinates={{
                latitude: draft.location.latitude,
                longitude: draft.location.longitude
              }}
                height={168}
              title=""
              placeName={locationPlace ?? undefined}
            />
          </View>
        ) : (
          <Text style={styles.errorText}>Location is required.</Text>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <Text style={styles.panelTitle}>Evidence</Text>
        <View style={styles.evidenceSection}>
          <View style={styles.evidenceHeader}>
            <Image accessibilityLabel="Photo evidence" source={photoEvidenceIcon} style={styles.evidenceIcon} />
            <Text style={styles.evidenceTitle}>Photo</Text>
          </View>
          {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
            <Image
              accessibilityLabel="Selected hazard evidence preview"
              source={{ uri: draft.photoEvidence.selected.localUri }}
              style={styles.photoPreview}
            />
          ) : (
            <Text style={styles.helperText}>No photo added.</Text>
          )}
        </View>
        <View style={styles.evidenceDivider} />
        <View style={styles.evidenceSection}>
          <View style={styles.evidenceHeader}>
            <Image accessibilityLabel="Voice evidence" source={voiceEvidenceIcon} style={styles.evidenceIcon} />
            <Text style={styles.evidenceTitle}>Voice</Text>
          </View>
          {draft.voiceEvidence.status === 'LOCAL_SELECTED' ? (
            <VoiceNotePlayer
              durationSeconds={draft.voiceEvidence.selected.durationSeconds}
              title="Voice recording"
              uri={draft.voiceEvidence.selected.localUri}
            />
          ) : (
            <Text style={styles.helperText}>No voice recording.</Text>
          )}
        </View>
      </View>

      <View style={styles.summaryPanel}>
        <Text style={styles.panelTitle}>What can you see?</Text>
        <Text style={styles.descriptionText}>{draft.description.trim() || 'No description entered.'}</Text>
      </View>

      <View style={styles.connectionPanel}>
        <View style={styles.connectionDot} />
        <View style={styles.connectionTextWrap}>
          <Text style={styles.connectionTitle}>Connection status</Text>
          <Text style={styles.helperText}>
            {submitState.reason === 'network'
              ? 'Connection problem detected. Your draft is still saved on this screen.'
              : 'Ready to send. Your draft stays here until submission finishes.'}
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
        message: 'That evidence file could not be uploaded. Use a JPG/PNG photo or M4A/AAC voice note.'
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
          message: "Couldn't upload the evidence. Check your connection and try again."
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
          ? 'Your evidence was uploaded, but the report could not be submitted. Check your connection and try again.'
          : 'Could not submit the report. Check your connection and try again.'
      };
    }

    return {
      reason: originalError.status === 400 ? 'validation' : 'server',
      message: error.mediaReference
        ? 'Your evidence was uploaded, but the report could not be submitted. Try again.'
        : reportCreateFailureMessageFor(originalError)
    };
  }

  if (error.stage === 'upload') {
    return {
      reason: 'upload',
      message: "Couldn't upload the evidence. Try again."
    };
  }

  return {
    reason: 'server',
    message: error.mediaReference
      ? 'Your evidence was uploaded, but the report could not be submitted. Try again.'
      : 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.'
  };
}

function uploadFailureMessageFor(error: ApiClientError) {
  if (error.status === 413) {
    return 'That evidence file is too large to upload. Choose a smaller file and try again.';
  }

  if (error.status === 415) {
    return 'That evidence format is not supported. Use a JPG/PNG photo or M4A/AAC voice note.';
  }

  if (error.status === 400) {
    return 'That evidence file could not be uploaded. Choose a supported file and try again.';
  }

  return "Couldn't upload the evidence right now. Try again.";
}

function reportCreateFailureMessageFor(error: ApiClientError) {
  if (error.status === 400) {
    return 'Some report details are invalid. Please edit the report and try again.';
  }

  return 'SafeAlert could not submit the report right now. Your draft is still here, so you can retry.';
}

function evidenceNeedsUpload(draft: ReportHazardDraft) {
  return (
    (draft.photoEvidence.status === 'LOCAL_SELECTED' &&
      !draft.photoEvidence.selected.uploadedMediaReference) ||
    (draft.voiceEvidence.status === 'LOCAL_SELECTED' &&
      !draft.voiceEvidence.selected.uploadedMediaReference)
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
  summaryIconImage: {
    width: 30,
    height: 30,
    resizeMode: 'contain'
  },
  evidenceIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain'
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
  locationPlaceText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
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
  evidenceSection: {
    gap: 10
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  evidenceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  evidenceDivider: {
    height: 1,
    backgroundColor: dashboardTheme.colors.border
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

