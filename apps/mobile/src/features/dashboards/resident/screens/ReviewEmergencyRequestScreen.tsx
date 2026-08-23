import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { formatCoordinate } from '../../shared/currentLocation';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import {
  accessConditionLabels,
  emergencyAssistanceTypeLabels,
  useEmergencyAssistanceDraft
} from '../emergencyAssistanceDraft';
import { residentBottomNavItems } from '../mockData';

export function ReviewEmergencyRequestScreen() {
  const router = useRouter();
  const { draft, validation } = useEmergencyAssistanceDraft();
  const [submitNoticeVisible, setSubmitNoticeVisible] = useState(false);
  const canSubmit = validation.isValid;
  const vulnerablePeopleDetails = getRelevantVulnerablePeople(draft.vulnerablePeople);

  const editRequest = () => {
    router.push('/resident/help');
  };

  const submitRequest = () => {
    if (!canSubmit) {
      return;
    }

    setSubmitNoticeVisible(true);
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
            <Text style={styles.coordinateText}>Latitude {formatCoordinate(draft.location.latitude)}</Text>
            <Text style={styles.coordinateText}>Longitude {formatCoordinate(draft.location.longitude)}</Text>
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

      {submitNoticeVisible ? (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>Submission not connected yet</Text>
          <Text style={styles.infoText}>
            Your emergency request draft is still preserved. The backend submission step will be wired in the next implementation.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Edit emergency request"
          accessibilityRole="button"
          onPress={editRequest}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <Text style={styles.editButtonText}>Edit Request</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Submit emergency request"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={submitRequest}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
            pressed && canSubmit && styles.pressed
          ]}
        >
          <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
            Submit Emergency Request
          </Text>
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
    backgroundColor: '#f3fffe'
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
    borderColor: '#f0c6c1',
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: '#fff5f4'
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
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
  editButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
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
  pressed: {
    opacity: 0.82
  }
});
