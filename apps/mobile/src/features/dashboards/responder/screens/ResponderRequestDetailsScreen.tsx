import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { getCachedResponderRequest, updateCachedResponderRequest } from '../requestDetailsCache';
import { displayValue } from '../requestDetails';
import { replaceResponderRequestCache } from '../requestDetailsCache';
import { listAssignedResponderRequests, listPendingResponderRequests } from '../api/responderRequestsApi';
import { acceptResponderRequest, declineResponderRequest } from '../api/responderDecisionApi';
import { updateResponderRequestProgress } from '../api/responderProgressApi';
import {
  canManageResponderProgress,
  getResponderProgressAction,
  progressStatusLabel,
  responderProgressFeedback
} from '../progressUi';
import {
  canShowResponderDecisionActions,
  decisionButtonLabel,
  isResponderDecisionBusy,
  type ResponderDecisionAction
} from '../decisionUi';

export function ResponderRequestDetailsScreen() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const [updatedRequest, setUpdatedRequest] = useState<SafeResponseRequest | null>(null);
  const responseRequest = updatedRequest?.id === requestId && updatedRequest?.assignedResponderId === user?.id
    ? updatedRequest
    : requestId ? getCachedResponderRequest(requestId) : null;
  const [decisionAction, setDecisionAction] = useState<ResponderDecisionAction>('idle');
  const progressInFlightRef = useRef(false);
  const [progressFeedback, setProgressFeedback] = useState<{
    requestId: string;
    kind: 'updating' | 'success' | 'error';
    message: string;
  } | null>(null);
  const currentFeedback = progressFeedback?.requestId === requestId ? progressFeedback : null;
  const isUpdatingProgress = progressFeedback?.kind === 'updating';
  const progressAction = getResponderProgressAction(responseRequest, user);
  const progressDisabled = isUpdatingProgress || !accessToken?.trim();

  const updateProgress = async () => {
    if (
      progressInFlightRef.current ||
      !requestId ||
      requestId !== responseRequest?.id ||
      !progressAction ||
      !accessToken?.trim()
    ) {
      return;
    }

    // The ref blocks repeated taps before React can render the disabled state.
    progressInFlightRef.current = true;
    setProgressFeedback({ requestId, kind: 'updating', message: 'Updating progress...' });

    try {
      const updated = await updateResponderRequestProgress(requestId, progressAction.nextStatus, accessToken);
      // Keep server-confirmed progress without refreshing the ASSIGNED-only queue.
      updateCachedResponderRequest(updated);
      setUpdatedRequest(updated);
      setProgressFeedback({
        requestId,
        kind: 'success',
        message: `Progress updated: ${progressStatusLabel(updated.status)}.`
      });
    } catch (error) {
      setProgressFeedback({ requestId, kind: 'error', message: responderProgressFeedback(error) });
    } finally {
      progressInFlightRef.current = false;
    }
  };

  const returnToRequests = () => router.replace('/responder');

  const refreshResponderQueues = useCallback(async () => {
    if (!accessToken) {
      throw new Error('Your session has expired. Please log in again.');
    }

    const [pending, assigned] = await Promise.all([
      listPendingResponderRequests(accessToken),
      listAssignedResponderRequests(accessToken)
    ]);

    // Refresh both queues because Accept moves a request from Pending to
    // Assigned, while Decline removes it only from this responder's Pending queue.
    replaceResponderRequestCache([...pending, ...assigned]);
  }, [accessToken]);

  const friendlyDecisionError = (error: unknown) => {
    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        return 'Your session has expired. Please log in again.';
      }

      if (error.status === 409 || error.code === 'REQUEST_NOT_AVAILABLE') {
        return 'This request is no longer available.';
      }
    }

    return 'Unable to update this request. Please check your connection and try again.';
  };

  const acceptRequest = async () => {
    if (
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    setDecisionAction('accepting');

    try {
      await acceptResponderRequest(requestId, accessToken);
      await refreshResponderQueues();
      Alert.alert('Request accepted', 'Request accepted successfully.', [
        { text: 'Back to Requests', onPress: returnToRequests }
      ]);
    } catch (error) {
      Alert.alert('Unable to accept request', friendlyDecisionError(error));
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
        try {
          await refreshResponderQueues();
        } catch {
          // The original action error is more useful than a secondary refresh error.
        }
      }
    } finally {
      // Always clear the busy state so a failed request cannot trap the UI.
      setDecisionAction('idle');
    }
  };

  const confirmDeclineRequest = () => {
    if (
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    if (Platform.OS === 'web') {
      // Browser confirmation is required on web because native Alert action
      // callbacks are not consistently available in React Native Web.
      if (globalThis.confirm('Decline this emergency request?')) {
        void declineRequest();
      }
      return;
    }

    Alert.alert('Decline this emergency request?', 'The request will remain available to other responders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void declineRequest() }
    ]);
  };

  const showDeclineSuccess = () => {
    const message = 'Request declined. It remains available to other responders.';

    if (Platform.OS === 'web') {
      // Web alerts do not reliably invoke React Native action callbacks, so
      // navigate explicitly after showing the success feedback.
      globalThis.alert(message);
      returnToRequests();
      return;
    }

    Alert.alert('Request declined', message, [
      { text: 'Back to Requests', onPress: returnToRequests }
    ]);
  };

  const declineRequest = async () => {
    if (
      decisionAction !== 'idle' ||
      !responseRequest ||
      !requestId ||
      responseRequest.status !== 'NEW' ||
      !accessToken
    ) {
      return;
    }

    setDecisionAction('declining');

    try {
      await declineResponderRequest(requestId, accessToken);
      await refreshResponderQueues();
      showDeclineSuccess();
    } catch (error) {
      Alert.alert('Unable to decline request', friendlyDecisionError(error));
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) {
        try {
          await refreshResponderQueues();
        } catch {
          // The original action error is more useful than a secondary refresh error.
        }
      }
    } finally {
      setDecisionAction('idle');
    }
  };

  if (!responseRequest) {
    return (
      <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
        <DetailsHeader onBack={returnToRequests} />
        <View style={styles.noticeCard}>
          <View style={styles.noticeIconWrap}>
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={22} />
          </View>
          <Text style={styles.noticeTitle}>Request not available</Text>
          <Text style={styles.noticeBody}>This emergency request could not be found.</Text>
          <BackToRequestsButton onPress={returnToRequests} />
        </View>
      </DashboardScreen>
    );
  }

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
      <DetailsHeader onBack={returnToRequests} />

      <View style={styles.heroCard}>
        <View style={styles.heroBadgeRow}>
          <StatusBadge label={responseRequest.status} tone={statusTone(responseRequest.status)} />
        </View>
        <Text style={styles.heroTitle}>{formatAssistanceType(responseRequest.assistanceType)}</Text>
        <Text style={styles.heroSubtitle}>Request ID: {displayValue(responseRequest.id)}</Text>
      </View>

      {canManageResponderProgress(responseRequest, user) ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>RESPONSE PROGRESS</Text>
          <Text style={styles.detailValue}>Current status: {progressStatusLabel(responseRequest.status)}</Text>
          {responseRequest.status === 'COMPLETED' ? (
            <Text accessibilityLiveRegion="polite" style={styles.progressSuccess}>
              {'\u2713'} Emergency response completed
            </Text>
          ) : progressAction ? (
            <Pressable
              accessibilityLabel={progressAction.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: progressDisabled, busy: isUpdatingProgress }}
              disabled={progressDisabled}
              onPress={() => void updateProgress()}
              style={({ pressed }) => [
                styles.backButton,
                progressDisabled && styles.disabledButton,
                pressed && !progressDisabled && styles.pressed
              ]}
            >
              {isUpdatingProgress ? <ActivityIndicator color="#ffffff" /> : null}
              <Text style={styles.backButtonText}>
                {isUpdatingProgress ? 'Updating progress...' : progressAction.label}
              </Text>
            </Pressable>
          ) : null}
          {!accessToken?.trim() && responseRequest.status !== 'COMPLETED' ? (
            <Text style={styles.progressError}>Please log in again to update this request.</Text>
          ) : null}
          {currentFeedback && currentFeedback.kind !== 'updating' ? (
            <Text
              accessibilityRole={currentFeedback.kind === 'error' ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={currentFeedback.kind === 'error' ? styles.progressError : styles.progressSuccess}
            >
              {currentFeedback.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      <DetailsSection title="LOCATION">
        <DetailRow label="GPS coordinates" value={formatLocation(responseRequest)} />
      </DetailsSection>

      <DetailsSection title="PEOPLE">
        <DetailRow label="People needing help" value={displayValue(responseRequest.affectedPeople)} />
        <DetailRow label="Number injured" value={displayValue(responseRequest.injuredPeople)} />
      </DetailsSection>

      <DetailsSection title="SPECIAL NEEDS">
        <DetailRow label="Vulnerable people" value={formatVulnerablePeople(responseRequest)} />
        <DetailRow label="Medical needs" value={responseRequest.medicalNeeds ? 'Yes' : 'No'} />
      </DetailsSection>

      <DetailsSection title="ACCESS">
        <DetailRow label="Road accessibility" value={displayValue(responseRequest.roadAccessibility)} />
      </DetailsSection>

      <DetailsSection title="DESCRIPTION">
        <Text style={styles.description}>{displayValue(responseRequest.description)}</Text>
      </DetailsSection>

      <DetailsSection title="CONTACT">
        <DetailRow label="Resident name" value={responseRequest.contact?.name} />
        <DetailRow label="Contact number" value={responseRequest.contact?.phoneNumber} />
      </DetailsSection>

      <DetailsSection title="SUBMITTED">
        <DetailRow label="Date / time" value={formatSubmittedAt(responseRequest.createdAt)} />
      </DetailsSection>

      {canShowResponderDecisionActions(responseRequest) ? (
        <ResponderDecisionActions
          action={decisionAction}
          onAccept={() => void acceptRequest()}
          onDecline={confirmDeclineRequest}
        />
      ) : null}

      <BackToRequestsButton onPress={returnToRequests} />
    </DashboardScreen>
  );
}

function ResponderDecisionActions({
  action,
  onAccept,
  onDecline
}: {
  action: ResponderDecisionAction;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const isBusy = isResponderDecisionBusy(action);

  return (
    <View style={styles.decisionSection}>
      <Text style={styles.decisionHeading}>RESPONDER DECISION</Text>
      <Text style={styles.decisionHelper}>Choose how you want to handle this new request.</Text>
      <View style={styles.decisionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={onDecline}
          style={({ pressed }) => [
            styles.declineButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && styles.pressed
          ]}
        >
          <Text style={styles.declineButtonText}>{decisionButtonLabel(action, 'decline')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          disabled={isBusy}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.acceptButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && styles.pressed
          ]}
        >
          <Text style={styles.acceptButtonText}>{decisionButtonLabel(action, 'accept')}</Text>
        </Pressable>
      </View>
      {isBusy ? (
        <Text style={styles.decisionHelper}>Processing your decision...</Text>
      ) : null}
    </View>
  );
}

function DetailsHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityLabel="Back to requests"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>Emergency Response</Text>
        <Text style={styles.headerTitle}>Emergency Request</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function DetailsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{displayValue(value)}</Text>
    </View>
  );
}

function BackToRequestsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backButtonText}>Back to Requests</Text>
    </Pressable>
  );
}

function formatAssistanceType(assistanceType: SafeResponseRequest['assistanceType']) {
  return assistanceType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLocation(responseRequest: SafeResponseRequest) {
  const coordinates = responseRequest.location?.coordinates;

  if (!coordinates || coordinates.length !== 2) {
    return 'Not provided';
  }

  const [longitude, latitude] = coordinates;
  return `Latitude ${latitude}, Longitude ${longitude}`;
}

function formatVulnerablePeople(responseRequest: SafeResponseRequest) {
  const vulnerablePeople = responseRequest.vulnerablePeople;

  if (!vulnerablePeople) {
    return 'Not provided';
  }

  const entries = [
    ['Children', vulnerablePeople.children],
    ['Elderly people', vulnerablePeople.elderlyPeople],
    ['Persons with disabilities', vulnerablePeople.personsWithDisabilities],
    ['Pregnant persons', vulnerablePeople.pregnantPersons]
  ].filter(([, count]) => typeof count === 'number' && count > 0);

  return entries.length
    ? entries.map(([label, count]) => `${label}: ${count}`).join(', ')
    : 'None reported';
}

function formatSubmittedAt(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function statusTone(status: SafeResponseRequest['status']) {
  return status === 'ASSIGNED' || status === 'COMPLETED' ? 'success' : 'info';
}

const styles = StyleSheet.create({
  progressSuccess: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.success
  },
  progressError: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.critical
  },
  decisionSection: {
      gap: 10,
      padding: 16,
      borderWidth: 1,
      borderColor: dashboardTheme.colors.border,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.surface,
      ...cardShadow
    },
  decisionHeading: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1,
      color: dashboardTheme.colors.info
    },
  decisionHelper: {
      fontSize: 14,
      lineHeight: 20,
      color: dashboardTheme.colors.muted
    },
  decisionRow: {
      flexDirection: 'row',
      gap: 10
    },
  declineButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: dashboardTheme.colors.critical,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.surface
    },
  declineButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: dashboardTheme.colors.critical,
      textAlign: 'center'
    },
  acceptButton: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: dashboardTheme.radius.md,
      backgroundColor: dashboardTheme.colors.primaryStrong
    },
  acceptButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#ffffff',
      textAlign: 'center'
    },
  disabledButton: {
    opacity: 0.55
  },
  content: {
    paddingBottom: 28
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  heroCard: {
    gap: 10,
    padding: 20,
    borderRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.primaryStrong,
    ...cardShadow
  },
  heroBadgeRow: {
    flexDirection: 'row'
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff'
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#dbeafe'
  },
  sectionCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  sectionBody: {
    gap: 12
  },
  detailRow: {
    gap: 4
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 16,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: dashboardTheme.colors.text
  },
  noticeCard: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  noticeIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text,
    textAlign: 'center'
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted,
    textAlign: 'center'
  },
  backButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primaryStrong
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.8
  }
});
