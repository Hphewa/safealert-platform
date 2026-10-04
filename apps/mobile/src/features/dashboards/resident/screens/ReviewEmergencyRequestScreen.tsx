import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CreateResponseRequestRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { goBackSafely } from '@/features/navigation/safeBack';
import { ApiClientError } from '@/services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { createResidentResponseRequest } from '../api/responseRequestApi';
import { saveEmergencyRequestWithOfflineSupport } from '../offlineEmergencyRequestQueue';
import {
  accessConditionLabels,
  emergencyAssistanceTypeLabels,
  useEmergencyAssistanceDraft
} from '../emergencyAssistanceDraft';
import { residentBottomNavItems } from '../mockData';

type SubmitState = {
  status: 'idle' | 'submitting' | 'queued' | 'error';
  reason?: 'validation' | 'auth' | 'network' | 'server';
  message: string | null;
};

export function ReviewEmergencyRequestScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { draft, resetDraft, setSubmittedResponseRequest, validation } = useEmergencyAssistanceDraft();
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle', message: null });
  const submitInFlightRef = useRef(false);
  const isSubmitting = submitState.status === 'submitting';
  const canSubmit = validation.isValid && !isSubmitting && submitState.status !== 'queued';
  const vulnerablePeopleDetails = getRelevantVulnerablePeople(draft.vulnerablePeople);

  const editRequest = () => {
    router.push('/resident/help');
  };

  const submitRequest = async () => {
    if (submitInFlightRef.current || isSubmitting) {
      return;
    }

    if (!validation.isValid || draft.location.status !== 'DETECTED') {
      setSubmitState({
        status: 'error',
        reason: 'validation',
        message: 'Please fix the highlighted emergency request details before submitting.'
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
    if (!user?.id) {
      setSubmitState({ status: 'error', reason: 'auth', message: 'Your session has expired. Please log in again before submitting.' });
      return;
    }

    const payload: CreateResponseRequestRequest = {
      assistanceType: draft.assistanceType!,
      location: {
        type: 'Point',
        coordinates: [draft.location.longitude, draft.location.latitude]
      },
      affectedPeople: draft.affectedPeopleCount,
      medicalNeeds: draft.medicalNeeds.requiresMedicalAssistance ?? false,
      injuredPeople: draft.medicalNeeds.injuredCount,
      vulnerablePeople: draft.vulnerablePeople,
      roadAccessibility: draft.accessCondition!,
      contact: {
        name: draft.contactDetails.name.trim(),
        phoneNumber: draft.contactDetails.phoneNumber.trim(),
        ...(draft.contactDetails.email?.trim() ? { email: draft.contactDetails.email.trim() } : {})
      },
      description: draft.emergencyDescription.trim(),
      ...(draft.specialRequirements.trim()
        ? { specialRequirements: draft.specialRequirements.trim() }
        : {})
    };

    submitInFlightRef.current = true;
    setSubmittedResponseRequest(null);
    setSubmitState({ status: 'submitting', message: null });

    try {
      const result = await saveEmergencyRequestWithOfflineSupport({ userId: user.id, accessToken, payload,
        // Preserve the existing online call shape. The queued retry adds its idempotency key.
        saveOnline: () => createResidentResponseRequest(payload, accessToken) });
      if (result.saved === 'local') {
        setSubmitState({ status: 'queued', message: 'Your emergency request is saved on this device and will be submitted automatically when your connection returns.' });
      } else {
        setSubmittedResponseRequest(result.response.responseRequest);
        resetDraft();
        router.replace('/resident/emergency-request-submitted');
      }
      submitInFlightRef.current = false;
    } catch (error) {
      submitInFlightRef.current = false;
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
          onPress={() => goBackSafely(router, '/resident/emergency-assistance')}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Review Emergency Request</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.introText}>Please review the emergency details before submission is connected.</Text>

      <SummaryPanel icon="help-buoy-outline" title="Assistance Type">
        <Text style={styles.primaryValue}>
          {draft.assistanceType ? emergencyAssistanceTypeLabels[draft.assistanceType] : 'Not selected'}
        </Text>
      </SummaryPanel>

      <SummaryPanel icon="locate-outline" title="Location">
        {draft.location.status === 'DETECTED' ? (
          <View style={styles.locationPreview}>
            <Text style={styles.locationPreviewTitle}>Detected coordinates</Text>
            <HumanReadableLocation
              location={{ type: 'Point', coordinates: [draft.location.longitude, draft.location.latitude] }}
              style={styles.coordinateText}
            />
            <Text style={styles.helperText}>Saved for the backend as [longitude, latitude].</Text>
          </View>
        ) : (
          <Text style={styles.errorText}>Current location is required.</Text>
        )}
      </SummaryPanel>

      <SummaryPanel icon="people-outline" title="People">
        <View style={styles.detailGrid}>
          <ReviewDetail label="Affected people" value={String(draft.affectedPeopleCount)} />
          <ReviewDetail label="Injured people" value={String(draft.medicalNeeds.injuredCount)} />
        </View>
      </SummaryPanel>

      <SummaryPanel icon="medical-outline" title="Medical Needs">
        <View style={styles.detailGrid}>
          <ReviewDetail
            label="Medical assistance"
            value={draft.medicalNeeds.requiresMedicalAssistance ? 'Yes' : 'No'}
          />
          {draft.medicalNeeds.requiresMedicalAssistance ? (
            <ReviewDetail
              label="Relevant details"
              value={`${draft.medicalNeeds.injuredCount} injured people reported`}
            />
          ) : (
            <ReviewDetail label="Relevant details" value="No medical assistance requested" />
          )}
        </View>
      </SummaryPanel>

      <SummaryPanel icon="accessibility-outline" title="Vulnerable People">
        {vulnerablePeopleDetails.length ? (
          <View style={styles.listWrap}>
            {vulnerablePeopleDetails.map((item) => (
              <View key={item.label} style={styles.listItem}>
                <Text style={styles.listItemLabel}>{item.label}</Text>
                <Text style={styles.listItemValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>No additional vulnerable-person details were provided.</Text>
        )}
      </SummaryPanel>

      <SummaryPanel icon="trail-sign-outline" title="Road / Access Condition">
        <Text style={styles.primaryValue}>
          {draft.accessCondition ? accessConditionLabels[draft.accessCondition] : 'Not selected'}
        </Text>
      </SummaryPanel>

      <SummaryPanel icon="person-outline" title="Contact Details">
        <View style={styles.detailStack}>
          <ReviewLine label="Resident name" value={draft.contactDetails.name || 'Not available'} />
          <ReviewLine label="Account email" value={draft.contactDetails.email || 'Not available'} />
          <ReviewLine
            label="Response phone"
            value={draft.contactDetails.phoneNumber.trim() || 'Not provided'}
          />
        </View>
      </SummaryPanel>

      <SummaryPanel icon="document-text-outline" title="Emergency Description">
        <Text style={styles.descriptionText}>{draft.emergencyDescription.trim() || 'No description entered.'}</Text>
      </SummaryPanel>

      <SummaryPanel icon="chatbubble-ellipses-outline" title="Special Requirements">
        <Text style={styles.descriptionText}>{draft.specialRequirements.trim() || 'None'}</Text>
      </SummaryPanel>

      {!validation.isValid ? (
        <View style={styles.validationPanel}>
          {Object.values(validation.errors).map((message) => (
            <Text key={message} style={styles.errorText}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      {submitState.status === 'queued' ? (
        <View style={styles.validationPanel}>
          <Text style={styles.primaryValue}>{submitState.message}</Text>
          <Text style={styles.errorHelperText}>Keep SafeAlert open or return later. The request will be sent once the connection is restored.</Text>
        </View>
      ) : null}

      {submitState.status === 'error' ? (
        <View style={styles.validationPanel}>
          <Text style={styles.errorText}>{submitState.message}</Text>
          {(submitState.reason === 'network' || submitState.reason === 'server') && (
            <Text style={styles.errorHelperText}>
              Your current location, people information, medical needs, road condition, contact
              details, and notes are still saved in this draft.
            </Text>
          )}
          {submitState.reason === 'network' || submitState.reason === 'server' ? (
            <Pressable
              accessibilityLabel="Retry emergency request submission"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => {
                void submitRequest();
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
          accessibilityLabel="Edit emergency request"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={editRequest}
          style={({ pressed }) => [
            styles.editButton,
            isSubmitting && styles.editButtonDisabled,
            pressed && !isSubmitting && styles.pressed
          ]}
        >
          <Text style={[styles.editButtonText, isSubmitting && styles.editButtonTextDisabled]}>
            Edit Request
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Submit emergency request"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => {
            void submitRequest();
          }}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
            pressed && canSubmit && styles.pressed
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
              {submitState.status === 'error' ? 'Try Submit Again' : 'Submit Emergency Request'}
            </Text>
          )}
        </Pressable>
      </View>
    </DashboardScreen>
  );
}

function SummaryPanel({
  title,
  icon,
  children
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.summaryPanel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelIcon}>
          <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name={icon} size={20} />
        </View>
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
      {children}
    </View>
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

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lineItem}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function getRelevantVulnerablePeople(vulnerablePeople: {
  children: number;
  elderlyPeople: number;
  personsWithDisabilities: number;
  pregnantPersons: number;
}) {
  return [
    { label: 'Children', value: vulnerablePeople.children },
    { label: 'Elderly people', value: vulnerablePeople.elderlyPeople },
    { label: 'Persons with disabilities', value: vulnerablePeople.personsWithDisabilities },
    { label: 'Pregnant persons', value: vulnerablePeople.pregnantPersons }
  ]
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: item.label,
      value: String(item.value)
    }));
}

function submitErrorStateFor(error: unknown): Pick<SubmitState, 'reason' | 'message'> {
  if (error instanceof ApiClientError) {
    // Recognize both zero-status (typical fetch offline/drop) and NETWORK_ERROR client codes
    if (error.status === 0 || error.code === 'NETWORK_ERROR') {
      return {
        reason: 'network',
        message:
          'Cannot reach SafeAlert right now. Your emergency request draft was not lost. Check your connection and retry.'
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        reason: 'auth',
        message: 'Your session could not submit this emergency request. Please log in again.'
      };
    }

    if (error.status === 400) {
      return {
        reason: 'validation',
        message: 'Some emergency request details are invalid. Please edit the request and try again.'
      };
    }

    return {
      reason: 'server',
      message:
        'SafeAlert could not submit the emergency request right now. Your draft is still here, so you can retry.'
    };
  }

  return {
    reason: 'server',
    message:
      'SafeAlert could not submit the emergency request right now. Your draft is still here, so you can retry.'
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
  introText: {
    fontSize: 15,
    lineHeight: 22,
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
  panelTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  primaryValue: {
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
  listWrap: {
    gap: 10
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  listItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  listItemValue: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  detailStack: {
    gap: 10
  },
  lineItem: {
    gap: 4
  },
  lineLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  lineValue: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.text
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
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
  errorHelperText: {
    fontSize: 13,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
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
  pressed: {
    opacity: 0.82
  }
});
