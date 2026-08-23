import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/features/auth/hooks/useAuth';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { CounterField } from '../components/CounterField';
import { SelectableCard } from '../components/SelectableCard';
import {
  emergencyDescriptionMaxLength,
  specialRequirementsMaxLength,
  type AccessCondition,
  type EmergencyAssistanceType,
  useEmergencyAssistanceDraft
} from '../emergencyAssistanceDraft';
import { residentBottomNavItems } from '../mockData';

const assistanceTypeOptions: Array<{
  label: string;
  value: EmergencyAssistanceType;
  icon: string;
}> = [
  { label: 'Rescue / Evacuation', value: 'RESCUE_EVACUATION', icon: 'boat-outline' },
  { label: 'Medical Assistance', value: 'MEDICAL_ASSISTANCE', icon: 'medical-outline' },
  { label: 'Flood Assistance', value: 'FLOOD_ASSISTANCE', icon: 'water-outline' },
  { label: 'Shelter / Relocation', value: 'SHELTER_RELOCATION', icon: 'home-outline' },
  { label: 'Other', value: 'OTHER', icon: 'help-circle-outline' }
];

const accessConditionOptions: Array<{
  label: string;
  value: AccessCondition;
}> = [
  { label: 'Accessible', value: 'ACCESSIBLE' },
  { label: 'Limited', value: 'LIMITED' },
  { label: 'Blocked', value: 'BLOCKED' },
  { label: 'Unknown', value: 'UNKNOWN' }
];

export function EmergencyAssistanceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, setDraft, validation } = useEmergencyAssistanceDraft();
  const [reviewQueued, setReviewQueued] = useState(false);
  const canReviewRequest = validation.isValid;
  const locationActionLabel = draft.location.status === 'UNAVAILABLE' ? 'Retry' : 'Use Current Location';

  useEffect(() => {
    if (!user) {
      return;
    }

    setDraft((current) => {
      const nextContactDetails = {
        ...current.contactDetails,
        name: user.name,
        email: user.email,
        usesAuthenticatedProfile: true
      };

      if (
        current.contactDetails.name === nextContactDetails.name &&
        current.contactDetails.email === nextContactDetails.email &&
        current.contactDetails.usesAuthenticatedProfile === nextContactDetails.usesAuthenticatedProfile
      ) {
        return current;
      }

      return {
        ...current,
        contactDetails: nextContactDetails
      };
    });
  }, [setDraft, user]);

  const setAssistanceType = (assistanceType: EmergencyAssistanceType) => {
    setDraft((current) => ({
      ...current,
      assistanceType,
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const updateAffectedPeopleCount = (affectedPeopleCount: number) => {
    setDraft((current) => ({
      ...current,
      affectedPeopleCount,
      medicalNeeds: {
        ...current.medicalNeeds,
        injuredCount: Math.min(current.medicalNeeds.injuredCount, affectedPeopleCount)
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const setMedicalNeeds = (requiresMedicalAssistance: boolean) => {
    setDraft((current) => ({
      ...current,
      medicalNeeds: {
        requiresMedicalAssistance,
        injuredCount: requiresMedicalAssistance ? current.medicalNeeds.injuredCount : 0
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const updateInjuredCount = (injuredCount: number) => {
    setDraft((current) => ({
      ...current,
      medicalNeeds: {
        ...current.medicalNeeds,
        injuredCount
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const setAccessCondition = (accessCondition: AccessCondition) => {
    setDraft((current) => ({
      ...current,
      accessCondition,
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const updateVulnerableCount = (
    key: 'children' | 'elderlyPeople' | 'personsWithDisabilities' | 'pregnantPersons',
    value: number
  ) => {
    setDraft((current) => ({
      ...current,
      vulnerablePeople: {
        ...current.vulnerablePeople,
        [key]: value
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const setEmergencyDescription = (emergencyDescription: string) => {
    setDraft((current) => ({
      ...current,
      emergencyDescription,
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const trimEmergencyDescription = () => {
    setDraft((current) => ({
      ...current,
      emergencyDescription: current.emergencyDescription.trim()
    }));
  };

  const setSpecialRequirements = (specialRequirements: string) => {
    setDraft((current) => ({
      ...current,
      specialRequirements,
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const trimSpecialRequirements = () => {
    setDraft((current) => ({
      ...current,
      specialRequirements: current.specialRequirements.trim()
    }));
  };

  const requestCurrentLocation = () => {
    setDraft((current) => ({
      ...current,
      location: {
        status: 'UNAVAILABLE',
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        source: null,
        updatedAt: new Date().toISOString(),
        message:
          "Current-location GPS integration isn't connected yet. You can retry later or continue with manual location adjustment."
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const markLocationForAdjustment = () => {
    setDraft((current) => ({
      ...current,
      location: {
        status: 'MANUAL_REVIEW',
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        source: 'MANUAL',
        updatedAt: new Date().toISOString(),
        message: 'Manual map adjustment will be connected in the next step of this flow.'
      },
      reviewRequestedAt: null
    }));
    setReviewQueued(false);
  };

  const queueReview = () => {
    if (!canReviewRequest) {
      return;
    }

    setDraft((current) => ({
      ...current,
      reviewRequestedAt: new Date().toISOString()
    }));
    setReviewQueued(true);
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
        <Text style={styles.headerTitle}>Emergency Assistance</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.introPanel}>
        <Text style={styles.introTitle}>Share the essentials for urgent help.</Text>
        <Text style={styles.introText}>
          This request form is ready for the resident flow now, with GPS and review handoff kept prepared for the next implementation step.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assistance Type</Text>
        <View accessibilityRole="radiogroup" style={styles.optionGrid}>
          {assistanceTypeOptions.map((option) => (
            <SelectableCard
              icon={option.icon}
              key={option.value}
              label={option.label}
              onSelect={setAssistanceType}
              selected={draft.assistanceType === option.value}
              value={option.value}
            />
          ))}
        </View>
        <ValidationMessage message={validation.errors.assistanceType} />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
          </View>
          <View style={styles.panelHeaderText}>
            <Text style={styles.panelTitle}>Current Location</Text>
            <Text style={styles.panelText}>
              {draft.location.status === 'IDLE'
                ? 'No live coordinates yet. This section is prepared for GPS integration.'
                : draft.location.message}
            </Text>
            {draft.location.updatedAt ? (
              <Text style={styles.helperNote}>Last updated {formatTimestamp(draft.location.updatedAt)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.locationActionRow}>
          <Pressable
            accessibilityLabel={locationActionLabel}
            accessibilityRole="button"
            onPress={requestCurrentLocation}
            style={({ pressed }) => [
              styles.primaryActionButton,
              draft.location.status === 'UNAVAILABLE' && styles.retryActionButton,
              pressed && styles.pressed
            ]}
          >
            <Text
              style={[
                styles.primaryActionButtonText,
                draft.location.status === 'UNAVAILABLE' && styles.retryActionButtonText
              ]}
            >
              {locationActionLabel}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Adjust location"
            accessibilityRole="button"
            onPress={markLocationForAdjustment}
            style={({ pressed }) => [styles.secondaryActionButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryActionButtonText}>Adjust Location</Text>
          </Pressable>
        </View>
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
          value={draft.affectedPeopleCount}
        />
        <ValidationMessage message={validation.errors.affectedPeopleCount} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Medical Needs</Text>
        <View accessibilityRole="radiogroup" style={styles.choiceRow}>
          <ChoiceButton
            label="Yes"
            onPress={() => setMedicalNeeds(true)}
            selected={draft.medicalNeeds.requiresMedicalAssistance === true}
          />
          <ChoiceButton
            label="No"
            onPress={() => setMedicalNeeds(false)}
            selected={draft.medicalNeeds.requiresMedicalAssistance === false}
          />
        </View>
        <ValidationMessage message={validation.errors.medicalNeeds} />

        {draft.medicalNeeds.requiresMedicalAssistance ? (
          <CounterField
            containerStyle={styles.secondaryCounter}
            decrementAccessibilityLabel="Decrease injured people"
            helperText="Use 0 if injuries are unknown."
            incrementAccessibilityLabel="Increase injured people"
            label="Number injured"
            max={draft.affectedPeopleCount}
            min={0}
            onChange={updateInjuredCount}
            value={draft.medicalNeeds.injuredCount}
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
            max={draft.affectedPeopleCount}
            min={0}
            onChange={(value) => updateVulnerableCount('children', value)}
            value={draft.vulnerablePeople.children}
          />
          <CounterField
            containerStyle={styles.counterGridItem}
            label="Elderly people"
            max={draft.affectedPeopleCount}
            min={0}
            onChange={(value) => updateVulnerableCount('elderlyPeople', value)}
            value={draft.vulnerablePeople.elderlyPeople}
          />
          <CounterField
            containerStyle={styles.counterGridItem}
            label="Persons with disabilities"
            max={draft.affectedPeopleCount}
            min={0}
            onChange={(value) => updateVulnerableCount('personsWithDisabilities', value)}
            value={draft.vulnerablePeople.personsWithDisabilities}
          />
          <CounterField
            containerStyle={styles.counterGridItem}
            label="Pregnant persons"
            max={draft.affectedPeopleCount}
            min={0}
            onChange={(value) => updateVulnerableCount('pregnantPersons', value)}
            value={draft.vulnerablePeople.pregnantPersons}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Road / Access Conditions</Text>
        <View accessibilityRole="radiogroup" style={styles.choiceGrid}>
          {accessConditionOptions.map((option) => (
            <ChoiceButton
              key={option.value}
              label={option.label}
              onPress={() => setAccessCondition(option.value)}
              selected={draft.accessCondition === option.value}
            />
          ))}
        </View>
        <ValidationMessage message={validation.errors.accessCondition} />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIconMuted}>
            <DashboardGlyph color={dashboardTheme.colors.info} name="person-outline" size={20} />
          </View>
          <View style={styles.panelHeaderText}>
            <Text style={styles.panelTitle}>Contact Details</Text>
            <Text style={styles.panelText}>Using authenticated resident account details already available in SafeAlert.</Text>
          </View>
        </View>

        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>Resident name</Text>
          <Text style={styles.readOnlyValue}>{draft.contactDetails.name || 'Not available'}</Text>
        </View>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyLabel}>Account email</Text>
          <Text style={styles.readOnlyValue}>{draft.contactDetails.email || 'Not available'}</Text>
        </View>
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
          value={draft.emergencyDescription}
        />
        <Text style={styles.characterCount}>
          {draft.emergencyDescription.trim().length}/{emergencyDescriptionMaxLength}
        </Text>
        <ValidationMessage message={validation.errors.emergencyDescription} />
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
          value={draft.specialRequirements}
        />
        <Text style={styles.characterCount}>
          {draft.specialRequirements.trim().length}/{specialRequirementsMaxLength}
        </Text>
        <ValidationMessage message={validation.errors.specialRequirements} />
      </View>

      {reviewQueued ? (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>Review step prepared</Text>
          <Text style={styles.infoText}>
            The review screen is intentionally not implemented yet. This strongly typed draft is now ready to pass forward to that next resident step.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel="Review emergency assistance request"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canReviewRequest }}
        disabled={!canReviewRequest}
        onPress={queueReview}
        style={({ pressed }) => [
          styles.reviewButton,
          !canReviewRequest && styles.reviewButtonDisabled,
          pressed && canReviewRequest && styles.pressed
        ]}
      >
        <Text style={[styles.reviewButtonText, !canReviewRequest && styles.reviewButtonTextDisabled]}>
          Review Request
        </Text>
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
  if (!message) {
    return null;
  }

  return <Text style={styles.validationText}>{message}</Text>;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
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
    backgroundColor: '#f3fffe',
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
  helperNote: {
    fontSize: 12,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  locationActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  primaryActionButton: {
    flexGrow: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  primaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  retryActionButton: {
    borderWidth: 1,
    borderColor: '#f0c6c1',
    backgroundColor: '#fff5f4'
  },
  retryActionButtonText: {
    color: dashboardTheme.colors.critical
  },
  secondaryActionButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
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
  validationText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: dashboardTheme.colors.critical
  },
  infoPanel: {
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.info,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.info
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.text
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
