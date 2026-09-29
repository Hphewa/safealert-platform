import { useMemo, useState } from 'react';
import {
  EMERGENCY_ASSISTANCE_TYPES,
  RESPONSE_EDITABLE_STATUS,
  ROAD_ACCESSIBILITIES,
  type EmergencyAssistanceType,
  type RoadAccessibility,
  type SafeResponseRequest,
  type VulnerablePeopleCounts
} from '@safealert/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { formatCoordinate } from '../../shared/currentLocation';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import type { DashboardIconName } from '../../shared/types';
import { CounterField } from '../components/CounterField';
import { EmergencyRequestStatePanel } from '../components/EmergencyRequestStatePanel';
import { SelectableCard } from '../components/SelectableCard';
import { emergencyDescriptionMaxLength, specialRequirementsMaxLength } from '../emergencyAssistanceDraft';
import { residentEmergencyRequestDetailsHref } from '../emergencyRequestNavigation';
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

  // 5. Vulnerable people counts validation: all categories must be non-negative whole numbers.
  const vulnerableValues = [
    form.vulnerablePeople?.children,
    form.vulnerablePeople?.elderlyPeople,
    form.vulnerablePeople?.personsWithDisabilities,
    form.vulnerablePeople?.pregnantPersons
  ];

  const hasNegativeVulnerable = vulnerableValues.some(
    (count) => typeof count === 'number' && count < 0
  );
  const hasNonIntegerVulnerable = vulnerableValues.some(
    (count) => typeof count !== 'number' || Number.isNaN(count) || !Number.isInteger(count)
  );

  if (hasNegativeVulnerable) {
    errors.vulnerablePeople = 'Vulnerable-person counts cannot be negative.';
  } else if (hasNonIntegerVulnerable) {
    errors.vulnerablePeople = 'Vulnerable-person counts must be whole numbers.';
  }

  // 6. Required Road Accessibility selection validation
  if (!form.roadAccessibility || !ROAD_ACCESSIBILITIES.includes(form.roadAccessibility)) {
    errors.roadAccessibility = 'Select the current road/access condition.';
  }

  // 7. Contact Details validation: name/email are account-derived, phone number is editable.
  // Validate phone format using standard telecom characters (7-32 characters, min 7 digits).
  const trimmedName = form.contact?.name?.trim() ?? '';
  const trimmedEmail = form.contact?.email?.trim() ?? '';
  const trimmedPhone = form.contact?.phoneNumber?.trim() ?? '';

  if (!trimmedName || !trimmedEmail) {
    errors.contactDetails = 'Your account contact information is required.';
  } else if (!trimmedPhone) {
    errors.contactDetails = 'Enter a contact phone number.';
  } else {
    const digitsOnly = trimmedPhone.replace(/\D/g, '');
    const hasValidPhoneFormat = /^[\d\s+\-()]{7,32}$/.test(trimmedPhone);
    if (!hasValidPhoneFormat || digitsOnly.length < 7) {
      errors.contactDetails = 'Enter a valid phone number.';
    }
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
      phoneNumber: typeof request.contact?.phoneNumber === 'string' ? request.contact.phoneNumber : ''
    }
  };
}

type ResidentEmergencyRequestEditScreenProps = {
  onValidContinue?: (form: ResidentEmergencyRequestEditForm) => void;
};

export function ResidentEmergencyRequestEditScreen({
  onValidContinue
}: ResidentEmergencyRequestEditScreenProps = {}) {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string | string[] }>();
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

  // Frontend status checks guard the edit UI for smooth UX, but backend authorization
  // and lifecycle enforcement from LDFEW-340 remain the final authority during any future mutation.
  const unavailableMessage = request ? residentEmergencyRequestEditUnavailableMessage(request.status) : null;
  const isEditable = request?.status === RESPONSE_EDITABLE_STATUS;

  // Initialize persisted values only once per request ID so later renders do not overwrite
  // the Resident's in-progress edits.
  let currentForm = formData;
  if (request && isEditable && initializedRequestId !== request.id) {
    const initialForm = mapRequestToEditForm(request);
    setInitializedRequestId(request.id);
    setFormData(initialForm);
    currentForm = initialForm;
  }

  // Real-time validation computation: updates automatically as the Resident modifies fields,
  // ensuring that stale errors clear immediately upon correction without requiring another tap.
  const validation = useMemo(
    () => (currentForm ? validateResidentEmergencyRequestEditForm(currentForm) : { errors: {}, isValid: true }),
    [currentForm]
  );
  const errors = hasAttemptedContinue ? validation.errors : {};
  const generalError =
    hasAttemptedContinue && !validation.isValid
      ? 'Please correct the highlighted fields before continuing.'
      : null;

  const returnToDetails = () => {
    // Return safely without saving any changes to the backend.
    if (router.canGoBack()) router.back();
    else router.replace(residentEmergencyRequestDetailsHref(requestId) ?? '/resident/my-emergency-requests');
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
      affectedPeopleCount,
      injuredCount: Math.min(currentForm.injuredCount, affectedPeopleCount)
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
    setFormData({
      ...currentForm,
      contact: {
        ...currentForm.contact,
        phoneNumber
      }
    });
  };

  const trimContactPhoneNumber = () => {
    if (!currentForm) return;
    setFormData({
      ...currentForm,
      contact: {
        ...currentForm.contact,
        phoneNumber: currentForm.contact.phoneNumber.trim()
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
  // and highlights errors. If valid, gates progression toward the next local step (LDFEW-344)
  // without calling backend mutation APIs.
  const handleContinue = () => {
    setHasAttemptedContinue(true);
    if (!currentForm) return;
    const result = validateResidentEmergencyRequestEditForm(currentForm);
    if (!result.isValid) {
      return;
    }
    onValidContinue?.(currentForm);
  };

  return (
    <DashboardScreen bottomNavItems={residentBottomNavItems} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={returnToDetails}
          style={({ pressed }) => [styles.headerBackButton, pressed && styles.pressed]}
        >
          <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Edit Request</Text>
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
                  <Text style={styles.coordinateText}>
                    {`Lat ${formatCoordinate(currentForm.latitude) || currentForm.latitude.toFixed(6)}, Long ${formatCoordinate(currentForm.longitude) || currentForm.longitude.toFixed(6)}`}
                  </Text>
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
            <ValidationMessage message={errors.injuredCount} />
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
            <ValidationMessage message={errors.vulnerablePeople} />
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
              keyboardType="phone-pad"
              onBlur={trimContactPhoneNumber}
              onChangeText={setContactPhoneNumber}
              placeholder="Enter a response contact phone number."
              placeholderTextColor={dashboardTheme.colors.muted}
              style={styles.contactInput}
              value={currentForm.contact.phoneNumber}
            />
            <ValidationMessage message={errors.contactDetails} />
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
            onPress={handleContinue}
            style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
          >
            <Text style={styles.continueButtonText}>Review Changes</Text>
          </Pressable>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Request Details"
        onPress={returnToDetails}
        style={({ pressed }) => [styles.backButtonBottom, pressed && styles.pressed]}
      >
        <Text style={styles.backButtonText}>Back to Request Details</Text>
      </Pressable>
    </DashboardScreen>
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
  pressed: {
    opacity: 0.82
  }
});
