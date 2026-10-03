import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH,
  FIELD_CONFIRMATION_REASON_MAX_LENGTH,
  UNABLE_TO_CONFIRM_REASONS,
  type FieldConfirmation,
  type FieldVerificationChecklist,
  type UnableToConfirmReason
} from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiClientError } from '@/services/api/client';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { resolveMediaReferenceUri } from '../../shared/media/mediaReference';
import { dashboardTheme } from '../../shared/theme';
import { VolunteerStateCard } from '../components/VolunteerStateCard';
import { volunteerBottomNavItems } from '../mockData';
import { getCommunityReportById } from '../api/communityReportsApi';
import { submitFieldConfirmation } from '../api/fieldConfirmationsApi';
import { uploadFieldEvidence } from '../api/fieldEvidenceMediaApi';
import {
  buildConfirmedInput,
  buildUnableToConfirmInput,
  emptyVerificationChecklistDraft,
  type FieldVerificationChecklistDraft
} from '../confirmation';
import { mapCommunityReportToVolunteerReport, resolveVolunteerReportLocation, type VolunteerCommunityReport } from '../reports';

type ConfirmationMode = 'confirmed' | 'unable';
type SelectedFieldPhoto = {
  localUri: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedMediaReference: string | null;
};

const checklistItems: ReadonlyArray<{
  key: keyof FieldVerificationChecklist;
  label: string;
  helper: string;
}> = [
  { key: 'locationMatches', label: 'Location matches', helper: 'Does the place match the resident report?' },
  { key: 'photoMatches', label: 'Photo matches', helper: 'Choose No if there is no resident photo to compare.' },
  { key: 'situationStillExists', label: 'Situation still exists', helper: 'Is the hazard still visible now?' },
  { key: 'severityAppearsCorrect', label: 'Severity appears correct', helper: 'Does the reported severity look reasonable?' }
];

export function VolunteerConfirmationScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ reportId?: string | string[]; mode?: string | string[] }>();
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;
  const initialMode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'unable' ? 'unable' : 'confirmed';
  const [report, setReport] = useState<VolunteerCommunityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<ConfirmationMode>(initialMode);
  const [checklist, setChecklist] = useState<FieldVerificationChecklistDraft>(emptyVerificationChecklistDraft);
  const [observation, setObservation] = useState('');
  const [photo, setPhoto] = useState<SelectedFieldPhoto | null>(null);
  const [reason, setReason] = useState<UnableToConfirmReason | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FieldConfirmation | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useFocusEffect(useCallback(() => {
    const current = ++generation.current;
    setLoading(true); setReport(null); setError(null); setResult(null); setMode(initialMode); setChecklist(emptyVerificationChecklistDraft);
    void (async () => {
      try {
        if (!reportId || !accessToken) throw new Error('Report or volunteer session is unavailable.');
        const response = await getCommunityReportById(reportId, accessToken);
        if (current === generation.current) setReport(await resolveVolunteerReportLocation(mapCommunityReportToVolunteerReport(response.report)));
      } catch (cause) {
        if (current === generation.current) setError(statusChangedMessage(cause));
      } finally {
        if (current === generation.current) setLoading(false);
      }
    })();
    return () => { generation.current += 1; };
  }, [reportId, accessToken, retry, initialMode]));

  async function selectPhoto(source: 'camera' | 'library') {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setError(source === 'camera' ? 'Camera permission is needed to add field evidence.' : 'Photo library permission is needed to add field evidence.');
        return;
      }

      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: false, mediaTypes: 'images', quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, mediaTypes: 'images', quality: 0.82 });

      if (picked.canceled) return;
      const asset = picked.assets[0];
      setPhoto({
        localUri: asset.uri,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
        uploadedMediaReference: null
      });
      setError(null);
    } catch {
      setError('Unable to select field evidence photo. Try again.');
    }
  }

  async function submit() {
    if (inFlight.current || !report || !reportId || !accessToken || result) return;
    const current = generation.current;
    try {
      inFlight.current = true; setSubmitting(true); setError(null);
      if (mode === 'confirmed') {
        let mediaReference = photo?.uploadedMediaReference ?? null;
        if (photo && !mediaReference) {
          const upload = await uploadFieldEvidence({
            localUri: photo.localUri,
            filename: photo.fileName,
            mimeType: photo.mimeType,
            accessToken
          });
          mediaReference = upload.mediaReference;
          setPhoto((currentPhoto) => currentPhoto ? { ...currentPhoto, uploadedMediaReference: upload.mediaReference } : currentPhoto);
        }
        const response = await submitFieldConfirmation(reportId, buildConfirmedInput(checklist, observation, mediaReference), accessToken);
        if (current === generation.current) setResult(response.confirmation);
      } else {
        const response = await submitFieldConfirmation(reportId, buildUnableToConfirmInput(reason, details), accessToken);
        if (current === generation.current) setResult(response.confirmation);
      }
    } catch (cause) {
      if (current === generation.current) setError(statusChangedMessage(cause));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return <DashboardScreen bottomNavItems={volunteerBottomNavItems} contentContainerStyle={styles.page}>
    <View style={styles.headerRow}>
      <Pressable accessibilityRole="button" disabled={submitting} onPress={() => router.back()} style={styles.iconButton}>
        <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.pageTitle}>Field Confirmation</Text>
      <View style={styles.headerSpacer} />
    </View>
    {loading ? <VolunteerStateCard loading title="Loading Report" message="Retrieving current report information." /> : result ?
      <VolunteerStateCard icon="checkmark-circle-outline" title="Field check submitted"
        message={result.outcome === 'CONFIRMED'
          ? `Your confirmation has been sent for officer review. Submitted ${new Date(result.createdAt).toLocaleString()}.`
          : `The issue has been flagged for officer review. Submitted ${new Date(result.createdAt).toLocaleString()}.`}
        actionLabel="Back to Reports" onActionPress={() => router.replace('/volunteer/nearby')} /> : !report ?
      <VolunteerStateCard title="Report Unavailable" message={error ?? 'This report cannot be reviewed.'} actionLabel="Retry" onActionPress={() => setRetry((value) => value + 1)} /> : <>
      <View style={styles.card}>
        <Image accessibilityLabel={`${report.hazardType} hazard icon`} source={report.hazardImage} style={styles.hazardImage} />
        <Text style={styles.cardTitle}>{report.hazardType}</Text>
        <Text style={styles.text}>{report.locationLabel}</Text>
        <Text style={styles.text}>{report.reportedDateTimeLabel} - {report.severity} - {report.status}</Text>
        <Text style={styles.text}>{report.description}</Text>
        {resolveMediaReferenceUri(report.mediaUrl) ? <Image source={{ uri: resolveMediaReferenceUri(report.mediaUrl)! }} accessibilityLabel="Resident report photo" style={styles.photo} /> : null}
      </View>

      <View style={styles.modeRow}>
        <ModeButton active={mode === 'confirmed'} disabled={submitting} label="Confirm Current Situation" onPress={() => { setMode('confirmed'); setError(null); }} />
        <ModeButton active={mode === 'unable'} disabled={submitting} label="Unable to Confirm" onPress={() => { setMode('unable'); setError(null); }} />
      </View>

      {mode === 'confirmed' ? <View style={styles.card}>
        <Text style={styles.cardTitle}>Verification Checklist</Text>
        {checklistItems.map((item) => (
          <View key={item.key} style={styles.checkItem}>
            <View style={styles.checkCopy}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.helper}>{item.helper}</Text>
            </View>
            <View style={styles.yesNoRow}>
              <ChecklistChoice
                disabled={submitting}
                label="Yes"
                onPress={() => setChecklist((current) => ({ ...current, [item.key]: true }))}
                selected={checklist[item.key] === true}
              />
              <ChecklistChoice
                disabled={submitting}
                label="No"
                onPress={() => setChecklist((current) => ({ ...current, [item.key]: false }))}
                selected={checklist[item.key] === false}
              />
            </View>
          </View>
        ))}
        <View style={styles.fieldHeader}>
          <Text style={styles.label}>Observation</Text>
          <Text style={styles.count}>{observation.trim().length}/{FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH}</Text>
        </View>
        <TextInput
          accessibilityLabel="Field observation"
          editable={!submitting}
          maxLength={FIELD_CONFIRMATION_OBSERVATION_MAX_LENGTH}
          multiline
          onChangeText={setObservation}
          placeholder="Describe what you observed in the field"
          style={styles.textArea}
          textAlignVertical="top"
          value={observation}
        />
        <Text style={styles.label}>Optional Field Photo</Text>
        {photo ? <View style={styles.photoBlock}>
          <Image accessibilityLabel="Selected field evidence photo" source={{ uri: photo.localUri }} style={styles.photo} />
          {photo.uploadedMediaReference ? <Text style={styles.helper}>Uploaded evidence will be reused on retry.</Text> : null}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => setPhoto(null)} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Remove Photo</Text>
          </Pressable>
        </View> : <Text style={styles.helper}>Add a photo if it helps officers compare field conditions.</Text>}
        <View style={styles.photoActions}>
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void selectPhoto('camera')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Take Photo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void selectPhoto('library')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
          </Pressable>
        </View>
      </View> : <View style={styles.card}>
        <Text style={styles.cardTitle}>Unable to Confirm / Flag Issue</Text>
        <Text style={styles.label}>Reason (required)</Text>
        {UNABLE_TO_CONFIRM_REASONS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value, disabled: submitting }} disabled={submitting}
          onPress={() => { setReason(value); setError(null); }} style={[styles.choice, reason === value && styles.selected]}><Text style={styles.text}>{value}</Text></Pressable>)}
        {reason === 'Other' ? <>
          <View style={styles.fieldHeader}>
            <Text style={styles.label}>Details</Text>
            <Text style={styles.count}>{details.trim().length}/{FIELD_CONFIRMATION_REASON_MAX_LENGTH}</Text>
          </View>
          <TextInput accessibilityLabel="Reason details (required)" editable={!submitting} multiline maxLength={FIELD_CONFIRMATION_REASON_MAX_LENGTH}
            placeholder="Describe why you cannot confirm" value={details} onChangeText={setDetails} style={styles.textArea} textAlignVertical="top" />
        </> : null}
      </View>}

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} onPress={() => void submit()} style={[styles.button, submitting && styles.disabled]}>
        {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : null}
        <Text style={styles.buttonText}>{submitting ? 'Submitting...' : mode === 'unable' ? 'Submit Unable to Confirm' : 'Submit Field Confirmation'}</Text>
      </Pressable>
    </>}
  </DashboardScreen>;
}

function ModeButton({ active, disabled, label, onPress }: { active: boolean; disabled: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.modeButton, active && styles.selected]}>
    <Text style={styles.text}>{label}</Text>
  </Pressable>;
}

function ChecklistChoice({
  disabled,
  label,
  onPress,
  selected
}: {
  disabled: boolean;
  label: 'Yes' | 'No';
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.yesNoButton, selected && styles.selected]}
    >
      <Text style={styles.yesNoText}>{label}</Text>
    </Pressable>
  );
}

function statusChangedMessage(cause: unknown) {
  if (cause instanceof ApiClientError) {
    if (cause.code === 'FIELD_CONFIRMATION_ALREADY_EXISTS') {
      return 'You already submitted a field check for this report.';
    }

    if (cause.status === 404 || cause.status === 409) {
      return 'This report is no longer available for field verification.';
    }
  }

  return cause instanceof Error ? cause.message : 'Your field check could not be submitted.';
}

const styles = StyleSheet.create({
  page: { gap: 16, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerSpacer: { width: 44 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: 22, backgroundColor: dashboardTheme.colors.surface },
  pageTitle: { flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '800', color: dashboardTheme.colors.text },
  card: { padding: 20, gap: 14, backgroundColor: dashboardTheme.colors.surface, borderRadius: dashboardTheme.radius.md, borderWidth: 1, borderColor: dashboardTheme.colors.border },
  hazardImage: { width: 52, height: 52, resizeMode: 'contain' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: dashboardTheme.colors.text },
  text: { color: dashboardTheme.colors.text, fontSize: 15, lineHeight: 23 },
  label: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '800' },
  helper: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 20 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modeButton: { flexGrow: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface },
  choice: { padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface },
  selected: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.primarySoft },
  checkItem: { gap: 10, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surface },
  checkCopy: { gap: 4 },
  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  yesNoText: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '800' },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  count: { color: dashboardTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  textArea: { minHeight: 112, padding: 14, borderWidth: 1, borderColor: dashboardTheme.colors.border, borderRadius: dashboardTheme.radius.sm, color: dashboardTheme.colors.text, backgroundColor: dashboardTheme.colors.surface },
  button: { minHeight: 54, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primary },
  buttonText: { color: '#ffffff', textAlign: 'center', fontWeight: '800' },
  disabled: { opacity: 0.5 },
  error: { color: dashboardTheme.colors.critical, fontWeight: '700' },
  photo: { width: '100%', height: 180, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.surfaceMuted },
  photoBlock: { gap: 10 },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  secondaryButton: { flexGrow: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: dashboardTheme.colors.primary, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primarySoft },
  secondaryButtonText: { color: dashboardTheme.colors.primaryStrong, fontWeight: '800' },
  removeButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dashboardTheme.colors.critical, borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.criticalSoft },
  removeButtonText: { color: dashboardTheme.colors.critical, fontWeight: '800' }
});
