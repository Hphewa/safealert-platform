import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMERGENCY_ASSISTANCE_TYPES,
  EMERGENCY_CONTACT_PHONE_MESSAGE,
  getEmergencyVulnerableCountError,
  isValidEmergencyContactPhoneNumber,
  sanitizeEmergencyContactPhoneInput,
  RESPONSE_EDITABLE_STATUS,
  ROAD_ACCESSIBILITIES,
  type EmergencyAssistanceType,
  type RoadAccessibility,
  type SafeResponseRequest,
  type UpdateResponseRequestRequest,
  type VulnerablePeopleCounts
} from '@safealert/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '../../../../services/api/client';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { HumanReadableLocation } from '../../shared/maps/HumanReadableLocation';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { DashboardIconName } from '../../shared/types';
import { CounterField } from '../components/CounterField';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { SelectableCard } from '../components/SelectableCard';
import { updateResidentResponseRequest } from '../api/responseRequestApi';
import {
  accessConditionLabels,
  emergencyAssistanceTypeLabels,
  emergencyDescriptionMaxLength,
  specialRequirementsMaxLength
} from '../emergencyAssistanceDraft';
import {
  parseResidentEmergencyRequestId,
  residentEmergencyRequestDetailsHref
} from '../emergencyRequestNavigation';
import { residentEmergencyRequestEditUnavailableMessage } from '../emergencyRequestPresentation';
import { residentBottomNavItems } from '../mockData';
import { useMyEmergencyRequestDetails } from '../useMyEmergencyRequestDetails';

const assistanceTypeOptions: Array<{
  label: string;
  value: EmergencyAssistanceType;
  icon: DashboardIconName;
}> = [
  { label: 'Rescue / Evacuation', value: 'RESCUE_EVACUATION', icon: 'boat-outline' },
  { label: 'Medical Assistance', value: 'MEDICAL_ASSISTANCE', icon: 'medical-outline' },
  { label: 'Flood Assistance', value: 'FLOOD_ASSISTANCE', icon: 'water-outline' },
  { label: 'Shelter / Relocation', value: 'SHELTER_RELOCATION', icon: 'home-outline' },
  { label: 'Other', value: 'OTHER', icon: 'help-circle-outline' }
];

const accessConditionOptions: Array<{
  label: string;
  value: RoadAccessibility;
}> = [
  { label: 'Accessible', value: 'ACCESSIBLE' },
  { label: 'Limited', value: 'LIMITED' },
  { label: 'Blocked', value: 'BLOCKED' },
  { label: 'Unknown', value: 'UNKNOWN' }
];

export type ResidentEmergencyRequestEditForm = {
  assistanceType: EmergencyAssistanceType;
  latitude: number;
  longitude: number;
  affectedPeopleCount: number;
  requiresMedicalAssistance: boolean;
  injuredCount: number;
  vulnerablePeople: VulnerablePeopleCounts;
  roadAccessibility: RoadAccessibility;
  description: string;
  specialRequirements: string;
  contact: {
    name: string;
    email: string;
    phoneNumber: string;
  };
};

export type ResidentEmergencyRequestValidationErrors = Partial<
  Record<
    | 'assistanceType'
    | 'affectedPeopleCount'
    | 'location'
    | 'injuredCount'
    | 'vulnerablePeople'
    | 'roadAccessibility'
    | 'contactDetails'
    | 'emergencyDescription'
    | 'specialRequirements',
    string
  >
>;

export type ResidentEmergencyRequestValidationResult = {
  errors: ResidentEmergencyRequestValidationErrors;
  isValid: boolean;
};

// Reuse create-request business rules so editing cannot persist values that a newly submitted request would reject.
export function validateResidentEmergencyRequestEditForm(
  form: ResidentEmergencyRequestEditForm
): ResidentEmergencyRequestValidationResult {
  const errors: ResidentEmergencyRequestValidationErrors = {};

  // 1. Required Assistance Type validation
  if (!form.assistanceType || !EMERGENCY_ASSISTANCE_TYPES.includes(form.assistanceType)) {
    errors.assistanceType = 'Select an assistance type.';
  }

  // 2. Affected people numeric validation: must be an integer >= 1.
  if (
    typeof form.affectedPeopleCount !== 'number' ||
    Number.isNaN(form.affectedPeopleCount) ||
    !Number.isInteger(form.affectedPeopleCount)
  ) {
    errors.affectedPeopleCount = 'Enter a valid whole number.';
  } else if (form.affectedPeopleCount < 0) {
    errors.affectedPeopleCount = 'Number of people cannot be negative.';
  } else if (form.affectedPeopleCount < 1) {
    errors.affectedPeopleCount = 'Enter the number of affected people.';
  }

  // 3. Location coordinate bounds validation: must be finite and within valid geographic limits.
  const hasValidCoordinates =
    typeof form.latitude === 'number' &&
    typeof form.longitude === 'number' &&
    Number.isFinite(form.latitude) &&
    Number.isFinite(form.longitude) &&
    form.latitude >= -90 &&
    form.latitude <= 90 &&
    form.longitude >= -180 &&
    form.longitude <= 180;

  if (!hasValidCoordinates) {
    errors.location = 'Valid emergency location coordinates are required.';
  }

  // 4. Injured people count & cross-field relationship validation:
  // Injured count must be a non-negative whole number, cannot exceed affected people,
  // and must be 0 if medical assistance is not required.
  if (
    typeof form.injuredCount !== 'number' ||
    Number.isNaN(form.injuredCount) ||
    !Number.isInteger(form.injuredCount)
  ) {
    errors.injuredCount = 'Enter a valid whole number.';
  } else if (form.injuredCount < 0) {
    errors.injuredCount = 'Injured people cannot be a negative number.';
  } else if (!form.requiresMedicalAssistance && form.injuredCount !== 0) {
    errors.injuredCount = 'Set injured people to 0 when no medical assistance is required.';
  } else if (
    Number.isInteger(form.affectedPeopleCount) &&
    form.affectedPeopleCount >= 1 &&
    form.injuredCount > form.affectedPeopleCount
  ) {
    errors.injuredCount = 'Injured people cannot exceed the total affected people.';
  }

  const vulnerableCountError = getEmergencyVulnerableCountError(form.affectedPeopleCount, form.vulnerablePeople);
  if (vulnerableCountError) errors.vulnerablePeople = vulnerableCountError;

  // 6. Required Road Accessibility selection validation
  if (!form.roadAccessibility || !ROAD_ACCESSIBILITIES.includes(form.roadAccessibility)) {
    errors.roadAccessibility = 'Select the current road/access condition.';
  }

  // 7. Contact Details validation: name/email are account-derived, phone number is editable.
  const trimmedName = form.contact?.name?.trim() ?? '';
  const trimmedEmail = form.contact?.email?.trim() ?? '';

  if (!trimmedName || !trimmedEmail) {
    errors.contactDetails = 'Your account contact information is required.';
  } else if (!isValidEmergencyContactPhoneNumber(form.contact?.phoneNumber)) {
    errors.contactDetails = EMERGENCY_CONTACT_PHONE_MESSAGE;
  }

  // 8. Description validation: required, non-whitespace, 3-character minimum, and 500-char max.
  const trimmedDescription = form.description?.trim() ?? '';
  if (!trimmedDescription) {
    errors.emergencyDescription = 'Describe the emergency.';
  } else if (trimmedDescription.length < 3) {
    errors.emergencyDescription = 'Description must be at least 3 characters.';
  } else if (trimmedDescription.length > emergencyDescriptionMaxLength) {
    errors.emergencyDescription = `Keep the description under ${emergencyDescriptionMaxLength} characters.`;
  }

  // 9. Special requirements validation: optional field, enforces 300-char max limit if provided.
  const trimmedSpecialRequirements = form.specialRequirements?.trim() ?? '';
  if (trimmedSpecialRequirements.length > specialRequirementsMaxLength) {
    errors.specialRequirements = `Keep special requirements under ${specialRequirementsMaxLength} characters.`;
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  };
}

// Map persisted backend data into local editable form state.
// Preserves saved coordinates and defaults missing/invalid values defensively.
export function mapRequestToEditForm(request: SafeResponseRequest): ResidentEmergencyRequestEditForm {
  // Preserve the emergency location saved with the request instead of replacing it with device GPS.
  // Stored coordinates are [longitude, latitude] GeoJSON order.
  const rawCoords =
    request.location?.type === 'Point' &&
    Array.isArray(request.location.coordinates) &&
    request.location.coordinates.length === 2 &&
    request.location.coordinates.every(Number.isFinite)
      ? request.location.coordinates
      : [0, 0];
  const longitude = rawCoords[0];
  const latitude = rawCoords[1];

  // Defensive mappings ensure corrupted or null values from server payloads do not crash the form.
  const affectedPeopleCount =
    typeof request.affectedPeople === 'number' &&
    Number.isInteger(request.affectedPeople) &&
    request.affectedPeople >= 1
      ? request.affectedPeople
      : 1;

  const requiresMedicalAssistance = request.medicalNeeds === true;

  const injuredCount =
    typeof request.injuredPeople === 'number' &&
    Number.isInteger(request.injuredPeople) &&
    request.injuredPeople >= 0
      ? request.injuredPeople
      : 0;

  const assistanceType: EmergencyAssistanceType = EMERGENCY_ASSISTANCE_TYPES.includes(request.assistanceType)
    ? request.assistanceType
    : 'OTHER';

  const roadAccessibility: RoadAccessibility = ROAD_ACCESSIBILITIES.includes(request.roadAccessibility)
    ? request.roadAccessibility
    : 'UNKNOWN';

  return {
    assistanceType,
    latitude,
    longitude,
    affectedPeopleCount,
    requiresMedicalAssistance,
    injuredCount,
    vulnerablePeople: {
      children:
        typeof request.vulnerablePeople?.children === 'number' &&
        Number.isInteger(request.vulnerablePeople.children) &&
        request.vulnerablePeople.children >= 0
          ? request.vulnerablePeople.children
          : 0,
      elderlyPeople:
        typeof request.vulnerablePeople?.elderlyPeople === 'number' &&
        Number.isInteger(request.vulnerablePeople.elderlyPeople) &&
        request.vulnerablePeople.elderlyPeople >= 0
          ? request.vulnerablePeople.elderlyPeople
          : 0,
      personsWithDisabilities:
        typeof request.vulnerablePeople?.personsWithDisabilities === 'number' &&
        Number.isInteger(request.vulnerablePeople.personsWithDisabilities) &&
        request.vulnerablePeople.personsWithDisabilities >= 0
          ? request.vulnerablePeople.personsWithDisabilities
          : 0,
      pregnantPersons:
        typeof request.vulnerablePeople?.pregnantPersons === 'number' &&
        Number.isInteger(request.vulnerablePeople.pregnantPersons) &&
        request.vulnerablePeople.pregnantPersons >= 0
          ? request.vulnerablePeople.pregnantPersons
          : 0
    },
    roadAccessibility,
    description: typeof request.description === 'string' ? request.description : '',
    specialRequirements: typeof request.specialRequirements === 'string' ? request.specialRequirements : '',
    contact: {
      name: typeof request.contact?.name === 'string' ? request.contact.name : '',
      email: typeof request.contact?.email === 'string' ? request.contact.email : '',
      phoneNumber: sanitizeEmergencyContactPhoneInput(typeof request.contact?.phoneNumber === 'string' ? request.contact.phoneNumber : '')
    }
  };
}

export type ResidentEmergencyRequestEditScreenProps = {
  requestId?: string;
  initialStep?: 'edit' | 'review';
  onValidContinue?: (form: ResidentEmergencyRequestEditForm) => void;
  onConfirmChanges?: (form: ResidentEmergencyRequestEditForm) => void;
};

export type ResidentEmergencyRequestReviewViewProps = {
  form: ResidentEmergencyRequestEditForm;
  onBackToEdit: () => void;
  onConfirmChanges?: (form: ResidentEmergencyRequestEditForm) => void;
  isSubmitting?: boolean;
  submitError?: string | null;
  isConflictError?: boolean;
  onViewDetails?: () => void;
};

export function ResidentEmergencyRequestEditScreen({
  requestId: requestIdProp,
  initialStep,
  onValidContinue,
  onConfirmChanges
}: ResidentEmergencyRequestEditScreenProps = {}) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string | string[]; step?: string | string[] }>();
  const requestId = requestIdProp ?? params.requestId;
  // Retrieve the existing request using the owner-scoped hook.
  const { request, error, refetch, isRefreshing, canRefetch } = useMyEmergencyRequestDetails(requestId);

  // Local state for editable form fields.
  const [formData, setFormData] = useState<ResidentEmergencyRequestEditForm | null>(null);
  // Track which requestId local state was initialized for.
  // One-time initialization ensures that subsequent rerenders or background data refreshes
  // do NOT overwrite the Resident's in-progress edits.
  const [initializedRequestId, setInitializedRequestId] = useState<string | null>(null);
  // Track whether the Resident has attempted to continue.
  // Avoids showing a wall of red validation errors before any user interaction.
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  // Track whether the resident is currently editing or reviewing their changes.
  // Keeping step state local ensures that moving between edit and review retains all unsaved edits in memory.
  const initialStepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const [step, setStep] = useState<'edit' | 'review'>(
    initialStep ?? (initialStepParam === 'review' ? 'review' : 'edit')
  );
  // Submission, conflict, and error state for LDFEW-345 persistence.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConflictError, setIsConflictError] = useState(false);
  const submitInFlightRef = useRef(false);

  // Frontend status checks guard the edit UI for smooth UX, but backend authorization
  // and lifecycle enforcement from LDFEW-340 remain the final authority during any future mutation.
  const unavailableMessage = request ? residentEmergencyRequestEditUnavailableMessage(request.status) : null;
  const isEditable = request?.status === RESPONSE_EDITABLE_STATUS;

  // Initialize persisted values only once per request ID so later renders do not overwrite
  // the Resident's in-progress edits.
  useEffect(() => {
    if (!request || !isEditable || initializedRequestId === request.id) return;
    setInitializedRequestId(request.id);
    setFormData(mapRequestToEditForm(request));
  }, [initializedRequestId, isEditable, request]);

  const currentForm = formData;

  // Real-time validation computation: updates automatically as the Resident modifies fields,
  // ensuring that stale errors clear immediately upon correction without requiring another tap.
  const validation = useMemo(
    () => (currentForm ? validateResidentEmergencyRequestEditForm(currentForm) : { errors: {}, isValid: true }),
    [currentForm]
  );
  // Review is disabled for invalid input, so corrections must be visible before tapping it.
  const errors = validation.errors;
  const generalError =
    hasAttemptedContinue && !validation.isValid
      ? 'Please correct the highlighted fields before continuing.'
      : null;

  const returnToDetails = () => {
    // Return to Request Details screen without saving in-memory edits.
    // If a conflict occurred, use replace with refreshed: true when history is absent,
    // or router.back() to pop the edit screen off the stack so Request Details regains focus and refetches.
    if (router.canGoBack()) router.back();
    else {
      router.replace(
        residentEmergencyRequestDetailsHref(requestId, isConflictError ? { refreshed: true } : undefined) ??
          '/resident/my-emergency-requests'
      );
    }
  };

  const handleBackToEdit = () => {
    // Return from review mode to edit mode. The in-memory form state remains intact.
    setSubmitError(null);
    setIsConflictError(false);
    setStep('edit');
  };

  const handleConfirmChanges = async () => {
    // Hand off the reviewed changes for persistence to MongoDB via the authenticated endpoint.
    // Guard against rapid duplicate taps: synchronously check and set submitInFlightRef before
    // React has a chance to trigger a re-render to disable the button.
    if (!currentForm || submitInFlightRef.current || isSubmitting) return;

    // Call onConfirmChanges callback prop if supplied (e.g. for testing/observation)
    onConfirmChanges?.(currentForm);

    if (!accessToken) {
      setSubmitError('Your resident session is unavailable. Please log in again.');
      return;
    }

    const normalizedRequestId = parseResidentEmergencyRequestId(requestId);
    if (!normalizedRequestId) {
      setSubmitError('Select a valid emergency request to update.');
      return;
    }

    // Defensive client-side validation check before network dispatch.
    // If invalid, keep the Resident on the screen with edits preserved and clear guidance.
    const validationResult = validateResidentEmergencyRequestEditForm(currentForm);
    if (!validationResult.isValid) {
      setSubmitError(validationResult.errors.contactDetails === EMERGENCY_CONTACT_PHONE_MESSAGE
        ? EMERGENCY_CONTACT_PHONE_MESSAGE : 'Please check the information entered and try again.');
      return;
    }

    // Strictly whitelisted payload: only fields defined in UpdateResponseRequestRequest.
    // Database and internal lifecycle attributes (residentId, status, assignedResponderId, timestamps)
    // must never be sent from the mobile client.
    const payload: UpdateResponseRequestRequest = {
      assistanceType: currentForm.assistanceType,
      location: {
        type: 'Point',
        coordinates: [currentForm.longitude, currentForm.latitude]
      },
      affectedPeople: currentForm.affectedPeopleCount,
      medicalNeeds: currentForm.requiresMedicalAssistance,
      injuredPeople: currentForm.injuredCount,
      vulnerablePeople: {
        children: currentForm.vulnerablePeople.children,
        elderlyPeople: currentForm.vulnerablePeople.elderlyPeople,
        personsWithDisabilities: currentForm.vulnerablePeople.personsWithDisabilities,
        pregnantPersons: currentForm.vulnerablePeople.pregnantPersons
      },
      roadAccessibility: currentForm.roadAccessibility,
      contact: {
        name: currentForm.contact.name.trim(),
        phoneNumber: currentForm.contact.phoneNumber.trim(),
        ...(currentForm.contact.email.trim() ? { email: currentForm.contact.email.trim() } : {})
      },
      description: currentForm.description.trim(),
      ...(currentForm.specialRequirements.trim()
        ? { specialRequirements: currentForm.specialRequirements.trim() }
        : {})
    };

    // Synchronous mutex lock prevents concurrent dispatch while asynchronous request is in flight.
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setIsConflictError(false);

    try {
      await updateResidentResponseRequest(normalizedRequestId, payload, accessToken);
      // Clean navigation back to the request details screen with refreshed and updated flags
      // so Request Details immediately fetches the updated request from the backend and displays success feedback.
      router.replace(
        residentEmergencyRequestDetailsHref(normalizedRequestId, { refreshed: true, updated: true }) ??
          '/resident/my-emergency-requests'
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        // Lifecycle conflict: request status changed (e.g. accepted/dispatched by an Emergency Responder).
        // The backend remains the authoritative source of truth. Lock confirm changes to prevent overwriting
        // active responder operations, display a clear user-facing explanation on the review screen, and offer
        // a direct action to view the latest request details.
        setIsConflictError(true);
        setSubmitError(
          'This request can no longer be edited because its status has changed.'
        );
      } else if (err instanceof ApiClientError && err.status === 400) {
        // Validation error: keep edits intact and display readable validation guidance.
        setSubmitError(
          err.message || 'Please check the information entered and try again.'
        );
      } else if (err instanceof ApiClientError && (err.status === 0 || err.code === 'NETWORK_ERROR')) {
        // Network failure: preserve all user-entered details in memory and allow retry without data loss.
        setSubmitError(
          "We couldn't update your request. Check your connection and try again."
        );
      } else if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        setSubmitError(
          'Your session is not authorized to edit this emergency request. Please log in again.'
        );
      } else if (err instanceof ApiClientError && err.status === 404) {
        setSubmitError('Emergency request not found.');
      } else {
        // Server or unexpected failure: keep all in-memory form values intact so the user can retry.
        // Never expose raw backend exceptions, stack traces, or technical IDs to the resident.
        setSubmitError(
          "We couldn't update your request. Check your connection and try again."
        );
      }
    } finally {
      // Re-enable submission state on failure so the resident can correct issues and retry.
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleHeaderBack = () => {
    if (step === 'review') {
      // In review mode, navigating back returns to the edit form with all edits preserved.
      setSubmitError(null);
      setIsConflictError(false);
      setStep('edit');
      return;
    }
    returnToDetails();
  };

  // Field change handlers modify only local component state.
  // Edit mode operates on this specific existing request and never creates a duplicate emergency request.
  const setAssistanceType = (assistanceType: EmergencyAssistanceType) => {
    if (!currentForm) return;
    setFormData({ ...currentForm, assistanceType });
  };

  const updateAffectedPeopleCount = (affectedPeopleCount: number) => {
    if (!currentForm) return;
    setFormData({
      ...currentForm,
      // Keep dependent counts visible so a reduced total never silently changes reported needs.
      affectedPeopleCount
    });
  };

  const setMedicalNeeds = (requiresMedicalAssistance: boolean) => {
    if (!currentForm) return;
    setFormData({
      ...currentForm,
      requiresMedicalAssistance,
      injuredCount: requiresMedicalAssistance ? currentForm.injuredCount : 0
    });
  };

  const updateInjuredCount = (injuredCount: number) => {
    if (!currentForm) return;
    setFormData({ ...currentForm, injuredCount });
  };

  const updateVulnerableCount = (key: keyof VulnerablePeopleCounts, value: number) => {
    if (!currentForm) return;
    setFormData({
      ...currentForm,
      vulnerablePeople: {
        ...currentForm.vulnerablePeople,
        [key]: value
      }
    });
  };

  const setRoadAccessibility = (roadAccessibility: RoadAccessibility) => {
    if (!currentForm) return;
    setFormData({ ...currentForm, roadAccessibility });
  };

  const setContactPhoneNumber = (phoneNumber: string) => {
    if (!currentForm) return;
    setPhoneTouched(true);
    setFormData({
      ...currentForm,
      contact: {
        ...currentForm.contact,
        phoneNumber: sanitizeEmergencyContactPhoneInput(phoneNumber)
      }
    });
  };

  const setEmergencyDescription = (description: string) => {
    if (!currentForm) return;
    setFormData({ ...currentForm, description });
  };

  const trimEmergencyDescription = () => {
    if (!currentForm) return;
    setFormData({ ...currentForm, description: currentForm.description.trim() });
  };

  const setSpecialRequirements = (specialRequirements: string) => {
    if (!currentForm) return;
    setFormData({ ...currentForm, specialRequirements });
  };

  const trimSpecialRequirements = () => {
    if (!currentForm) return;
    setFormData({ ...currentForm, specialRequirements: currentForm.specialRequirements.trim() });
  };

  // Attempt to continue: validates the form. If invalid, keeps the Resident on screen
  // and highlights errors. If valid, advances to the Review Changes step (LDFEW-344)
  // while preserving all in-progress edits in local state.
  const handleContinue = () => {
    setHasAttemptedContinue(true);
    if (!currentForm) return;
    const result = validateResidentEmergencyRequestEditForm(currentForm);
    if (!result.isValid) {
      return;
    }
    // Form is valid. Advance to review step while keeping edited form data intact in memory.
    setSubmitError(null);
    setIsConflictError(false);
    onValidContinue?.(currentForm);
    setStep('review');
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={handleHeaderBack}
          style={({ pressed }) => [styles.headerBackButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {step === 'review' ? 'Review Changes' : 'Edit Request'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!request ? (
        <EmergencyRequestStatePanel
          title={error ? 'Unable to open request' : 'Loading your emergency request...'}
          message={error ?? undefined}
          loading={isRefreshing}
          onRetry={error && canRefetch ? () => void refetch() : undefined}
        />
      ) : unavailableMessage || !currentForm ? (
        <EmergencyRequestStatePanel
          title="Editing unavailable"
          message={unavailableMessage ?? 'This request cannot be edited.'}
        />
      ) : step === 'review' ? (
        <ResidentEmergencyRequestReviewView
          form={currentForm}
          onBackToEdit={handleBackToEdit}
          onConfirmChanges={handleConfirmChanges}
          isSubmitting={isSubmitting}
          submitError={submitError}
          isConflictError={isConflictError}
          onViewDetails={returnToDetails}
        />
      ) : (
        <>
          <View style={styles.introPanel}>
            <Text style={styles.introTitle}>Edit Emergency Assistance Request</Text>
            <Text style={styles.introText}>
              Update your assistance details below. Your saved emergency location is preserved.
            </Text>
          </View>

          {generalError ? (
            <View accessibilityLiveRegion="polite" style={styles.generalErrorBanner}>
              <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={20} />
              <Text style={styles.generalErrorText}>{generalError}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assistance Type</Text>
            <View accessibilityRole="radiogroup" style={styles.optionGrid}>
              {assistanceTypeOptions.map((option) => (
                <SelectableCard
                  icon={option.icon}
                  key={option.value}
                  label={option.label}
                  onSelect={setAssistanceType}
                  selected={currentForm.assistanceType === option.value}
                  value={option.value}
                />
              ))}
            </View>
            <ValidationMessage message={errors.assistanceType} />
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelIcon}>
                <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
              </View>
              <View style={styles.panelHeaderText}>
                <Text style={styles.panelTitle}>Emergency Location</Text>
                <View style={styles.detectedLocation}>
                  <Text style={styles.detectedText}>Saved emergency location</Text>
                  <HumanReadableLocation
                    location={{ type: 'Point', coordinates: [currentForm.longitude, currentForm.latitude] }}
                    style={styles.coordinateText}
                  />
                  <Text style={styles.helperNote}>
                    Preserved from your submitted request.
                  </Text>
                </View>
              </View>
            </View>
            <ValidationMessage message={errors.location} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Number of affected people</Text>
            <CounterField
              decrementAccessibilityLabel="Decrease affected people"
              helperText="Minimum 1 person"
              incrementAccessibilityLabel="Increase affected people"
              label="Affected people"
              min={1}
              onChange={updateAffectedPeopleCount}
              value={currentForm.affectedPeopleCount}
            />
            <ValidationMessage message={errors.affectedPeopleCount} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Medical Needs</Text>
            <View accessibilityRole="radiogroup" style={styles.choiceRow}>
              <ChoiceButton
                label="Yes"
                onPress={() => setMedicalNeeds(true)}
                selected={currentForm.requiresMedicalAssistance === true}
              />
              <ChoiceButton
                label="No"
                onPress={() => setMedicalNeeds(false)}
                selected={currentForm.requiresMedicalAssistance === false}
              />
            </View>

            {currentForm.requiresMedicalAssistance ? (
              <CounterField
                containerStyle={styles.secondaryCounter}
                decrementAccessibilityLabel="Decrease injured people"
                helperText="Use 0 if injuries are unknown."
                incrementAccessibilityLabel="Increase injured people"
                label="Number injured"
                max={currentForm.affectedPeopleCount}
                min={0}
                onChange={updateInjuredCount}
                value={currentForm.injuredCount}
              />
            ) : null}
            <ValidationMessage message={validation.errors.injuredCount} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vulnerable People</Text>
            <View style={styles.counterGrid}>
              <CounterField
                containerStyle={styles.counterGridItem}
                label="Children"
                max={currentForm.affectedPeopleCount}
                min={0}
                onChange={(value) => updateVulnerableCount('children', value)}
                value={currentForm.vulnerablePeople.children}
              />
              <CounterField
                containerStyle={styles.counterGridItem}
                label="Elderly people"
                max={currentForm.affectedPeopleCount}
                min={0}
                onChange={(value) => updateVulnerableCount('elderlyPeople', value)}
                value={currentForm.vulnerablePeople.elderlyPeople}
              />
              <CounterField
                containerStyle={styles.counterGridItem}
                label="Persons with disabilities"
                max={currentForm.affectedPeopleCount}
                min={0}
                onChange={(value) => updateVulnerableCount('personsWithDisabilities', value)}
                value={currentForm.vulnerablePeople.personsWithDisabilities}
              />
              <CounterField
                containerStyle={styles.counterGridItem}
                label="Pregnant persons"
                max={currentForm.affectedPeopleCount}
                min={0}
                onChange={(value) => updateVulnerableCount('pregnantPersons', value)}
                value={currentForm.vulnerablePeople.pregnantPersons}
              />
            </View>
            <ValidationMessage message={validation.errors.vulnerablePeople} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Road / Access Conditions</Text>
            <View accessibilityRole="radiogroup" style={styles.choiceGrid}>
              {accessConditionOptions.map((option) => (
                <ChoiceButton
                  key={option.value}
                  label={option.label}
                  onPress={() => setRoadAccessibility(option.value)}
                  selected={currentForm.roadAccessibility === option.value}
                />
              ))}
            </View>
            <ValidationMessage message={errors.roadAccessibility} />
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelIconMuted}>
                <DashboardGlyph color={dashboardTheme.colors.info} name="person-outline" size={20} />
              </View>
              <View style={styles.panelHeaderText}>
                <Text style={styles.panelTitle}>Contact Details</Text>
                <Text style={styles.panelText}>
                  Using authenticated resident account details already available in SafeAlert.
                </Text>
              </View>
            </View>

            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyLabel}>Resident name</Text>
              <Text style={styles.readOnlyValue}>{currentForm.contact.name || 'Not available'}</Text>
            </View>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyLabel}>Account email</Text>
              <Text style={styles.readOnlyValue}>{currentForm.contact.email || 'Not available'}</Text>
            </View>
            <TextInput
              accessibilityLabel="Contact phone number"
              keyboardType="number-pad"
              inputMode="numeric"
              autoCorrect={false}
              onBlur={() => setPhoneTouched(true)}
              accessibilityHint="Enter exactly 10 digits, without spaces or symbols."
              onChangeText={setContactPhoneNumber}
              placeholder="Enter a response contact phone number."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={styles.contactInput}
              value={currentForm.contact.phoneNumber}
            />
            <ValidationMessage message={phoneTouched || hasAttemptedContinue || validation.errors.contactDetails !== EMERGENCY_CONTACT_PHONE_MESSAGE ? validation.errors.contactDetails : undefined} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Short Emergency Description</Text>
            <TextInput
              accessibilityLabel="Short emergency description"
              maxLength={emergencyDescriptionMaxLength}
              multiline
              onBlur={trimEmergencyDescription}
              onChangeText={setEmergencyDescription}
              placeholder="Briefly explain what is happening and what help is needed."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={styles.multilineInput}
              textAlignVertical="top"
              value={currentForm.description}
            />
            <Text style={styles.characterCount}>
              {currentForm.description.trim().length}/{emergencyDescriptionMaxLength}
            </Text>
            <ValidationMessage message={errors.emergencyDescription} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Requirements</Text>
            <TextInput
              accessibilityLabel="Special requirements"
              maxLength={specialRequirementsMaxLength}
              multiline
              onBlur={trimSpecialRequirements}
              onChangeText={setSpecialRequirements}
              placeholder="Optional notes about medicine, transport, shelter, mobility, or access needs."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={styles.secondaryMultilineInput}
              textAlignVertical="top"
              value={currentForm.specialRequirements}
            />
            <Text style={styles.characterCount}>
              {currentForm.specialRequirements.trim().length}/{specialRequirementsMaxLength}
            </Text>
            <ValidationMessage message={errors.specialRequirements} />
          </View>

          <Pressable
            accessibilityLabel="Review Changes"
            accessibilityRole="button"
            accessibilityState={{ disabled: !validation.isValid }}
            disabled={!validation.isValid}
            onPress={handleContinue}
            style={({ pressed }) => [styles.continueButton, !validation.isValid && styles.continueButtonDisabled, pressed && validation.isValid && styles.pressed]}
          >
            <Text style={styles.continueButtonText}>Review Changes</Text>
          </Pressable>
        </>
      )}

      {step === 'edit' || !request || unavailableMessage || !currentForm ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Request Details"
          onPress={returnToDetails}
          style={({ pressed }) => [styles.backButtonBottom, pressed && styles.pressed]}
        >
          <Text style={styles.backButtonText}>Back to Request Details</Text>
        </Pressable>
      ) : null}
    </DashboardScreen>
  );
}

// Read-only Review Changes view (LDFEW-344).
// Presents the resident's current in-memory edits before confirmation.
// Read-only controls prevent accidental inline edits during the review phase.
export function ResidentEmergencyRequestReviewView({
  form,
  onBackToEdit,
  onConfirmChanges,
  isSubmitting = false,
  submitError = null,
  isConflictError = false,
  onViewDetails
}: ResidentEmergencyRequestReviewViewProps) {
  // A deep link can skip the edit input; Review must still reject an invalid saved contact number.
  const phoneValid = isValidEmergencyContactPhoneNumber(form.contact.phoneNumber);
  // Confirm Changes hand-off:
  // Dispatches form updates to MongoDB via the authenticated endpoint in LDFEW-345.
  // Guard against rapid duplicate taps while submission is in-flight or if status conflict occurred.
  const handleConfirm = () => {
    if (isSubmitting || isConflictError || !phoneValid) return;
    onConfirmChanges?.(form);
  };

  return (
    <>
      <View style={styles.introPanel}>
        <Text style={styles.introTitle}>Review Changes</Text>
        <Text style={styles.introText}>
          Review your updated emergency assistance information before confirming.
        </Text>
      </View>

      <SummaryPanel icon="help-buoy-outline" title="Assistance Type">
        <Text style={styles.primaryValue}>
          {emergencyAssistanceTypeLabels[form.assistanceType] ?? form.assistanceType}
        </Text>
      </SummaryPanel>

      <SummaryPanel icon="locate-outline" title="Emergency Location">
        <View style={styles.detectedLocation}>
          <Text style={styles.detectedText}>Saved emergency location</Text>
          <HumanReadableLocation
            location={{ type: 'Point', coordinates: [form.longitude, form.latitude] }}
            style={styles.coordinateText}
          />
          <Text style={styles.helperNote}>Preserved from your submitted request.</Text>
        </View>
      </SummaryPanel>

      <SummaryPanel icon="people-outline" title="People">
        <View style={styles.detailGrid}>
          <ReviewDetail label="Affected people" value={String(form.affectedPeopleCount)} />
          <ReviewDetail label="Injured people" value={String(form.injuredCount)} />
        </View>
      </SummaryPanel>

      <SummaryPanel icon="medical-outline" title="Medical Needs">
        <View style={styles.detailGrid}>
          <ReviewDetail
            label="Medical assistance"
            value={form.requiresMedicalAssistance ? 'Yes' : 'No'}
          />
          <ReviewDetail
            label="Relevant details"
            value={
              form.requiresMedicalAssistance
                ? form.injuredCount > 0
                  ? `${form.injuredCount} injured people reported`
                  : 'Immediate medical attention required'
                : 'No medical assistance requested'
            }
          />
        </View>
      </SummaryPanel>

      <SummaryPanel icon="accessibility-outline" title="Vulnerable People">
        <View style={styles.detailGrid}>
          <ReviewDetail label="Children" value={String(form.vulnerablePeople.children)} />
          <ReviewDetail label="Elderly people" value={String(form.vulnerablePeople.elderlyPeople)} />
          <ReviewDetail
            label="Persons with disabilities"
            value={String(form.vulnerablePeople.personsWithDisabilities)}
          />
          <ReviewDetail
            label="Pregnant persons"
            value={String(form.vulnerablePeople.pregnantPersons)}
          />
        </View>
      </SummaryPanel>

      <SummaryPanel icon="trail-sign-outline" title="Road / Access Condition">
        <Text style={styles.primaryValue}>
          {accessConditionLabels[form.roadAccessibility] ?? form.roadAccessibility}
        </Text>
      </SummaryPanel>

      <SummaryPanel icon="person-outline" title="Contact Details">
        <View style={styles.detailStack}>
          <ReviewLine label="Resident name" value={form.contact.name || 'Not available'} />
          <ReviewLine label="Account email" value={form.contact.email || 'Not available'} />
          <ReviewLine
            label="Response phone"
            value={form.contact.phoneNumber.trim() || 'Not provided'}
          />
          {!phoneValid ? <ValidationMessage message={EMERGENCY_CONTACT_PHONE_MESSAGE} /> : null}
        </View>
      </SummaryPanel>

      <SummaryPanel icon="document-text-outline" title="Emergency Description">
        <Text style={styles.descriptionText}>
          {form.description.trim() || 'No description entered.'}
        </Text>
      </SummaryPanel>

      <SummaryPanel icon="chatbubble-ellipses-outline" title="Special Requirements">
        <Text style={styles.descriptionText}>
          {form.specialRequirements.trim() || 'None'}
        </Text>
      </SummaryPanel>

      {submitError ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
          <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={20} />
          <View style={styles.errorTextContainer}>
            <Text style={styles.errorText}>{submitError}</Text>
            {isConflictError && onViewDetails ? (
              <Pressable
                accessibilityLabel="View latest request details"
                accessibilityRole="button"
                onPress={onViewDetails}
                style={({ pressed }) => [styles.viewDetailsButton, pressed && styles.pressed]}
              >
                <Text style={styles.viewDetailsButtonText}>View Request Details</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.reviewActionRow}>
        <Pressable
          accessibilityLabel="Back to Edit"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onBackToEdit}
          style={({ pressed }) => [
            styles.backToEditButton,
            isSubmitting && styles.actionButtonDisabled,
            pressed && !isSubmitting && styles.pressed
          ]}
        >
          <Text style={[styles.backToEditButtonText, isSubmitting && styles.actionButtonTextDisabled]}>
            Back to Edit
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Confirm Changes"
          accessibilityRole="button"
          disabled={isSubmitting || isConflictError || !phoneValid}
          accessibilityState={{ disabled: isSubmitting || isConflictError || !phoneValid }}
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmChangesButton,
            (isSubmitting || isConflictError || !phoneValid) && styles.confirmChangesButtonDisabled,
            pressed && !isSubmitting && !isConflictError && phoneValid && styles.pressed
          ]}
        >
          {isSubmitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.confirmChangesButtonText}>Saving changes...</Text>
            </View>
          ) : (
            <Text
              style={[
                styles.confirmChangesButtonText,
                isConflictError && styles.confirmChangesButtonTextDisabled
              ]}
            >
              Confirm Changes
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

function SummaryPanel({
  icon,
  title,
  children
}: {
  icon: DashboardIconName;
  title: string;
  children: React.ReactNode;
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

function ChoiceButton({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceButton,
        selected && styles.choiceButtonSelected,
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.choiceButtonText, selected && styles.choiceButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ValidationMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={styles.validationText}>
      {message}
    </Text>
  );
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
  headerBackButton: {
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
  introPanel: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft,
    ...cardShadow
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  introText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  generalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.critical,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  generalErrorText: {
    flex: 1,
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
  continueButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  continueButtonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    color: '#ffffff'
  },
  continueButtonDisabled: {
    opacity: 0.5
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
  panel: {
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
    alignItems: 'flex-start',
    gap: 12
  },
  panelHeaderText: {
    flex: 1,
    gap: 4
  },
  panelIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  panelIconMuted: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.infoSoft
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
  detectedLocation: {
    gap: 4
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
  helperNote: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  choiceButton: {
    flexGrow: 1,
    minHeight: 50,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface
  },
  choiceButtonSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  choiceButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  choiceButtonTextSelected: {
    color: dashboardTheme.colors.primaryStrong
  },
  secondaryCounter: {
    marginTop: 4
  },
  counterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  counterGridItem: {
    flexBasis: '47%',
    flexGrow: 1
  },
  readOnlyField: {
    gap: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  readOnlyLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: dashboardTheme.colors.muted
  },
  readOnlyValue: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.text
  },
  contactInput: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    fontSize: 15,
    color: dashboardTheme.colors.text
  },
  multilineInput: {
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
  secondaryMultilineInput: {
    minHeight: 112,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.text
  },
  characterCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    fontWeight: '700',
    color: dashboardTheme.colors.muted
  },
  backButtonBottom: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border
  },
  backButtonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  summaryPanel: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  primaryValue: {
    fontSize: 16,
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
    minWidth: 130,
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
  reviewActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8
  },
  backToEditButton: {
    flexGrow: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  backToEditButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  confirmChangesButton: {
    flexGrow: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primary
  },
  confirmChangesButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff'
  },
  confirmChangesButtonDisabled: {
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border
  },
  confirmChangesButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  actionButtonDisabled: {
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    opacity: 0.6
  },
  actionButtonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.critical,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  errorTextContainer: {
    flex: 1,
    gap: 8
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  viewDetailsButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  viewDetailsButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  pressed: {
    opacity: 0.82
  }
});

