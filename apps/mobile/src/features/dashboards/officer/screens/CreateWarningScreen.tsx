import { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning, WARNING_FIELD_LIMITS, type CreateWarningRequest, type SafeWarning } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessment } from '../api/riskAssessmentApi';
import { saveWarningWithPhotos } from '../api/warningApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentStyles } from '../components/RiskAssessmentComponents';
import { WarningPage, warningStyles } from '../components/WarningComponents';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { dashboardTheme } from '../../shared/theme';
import { assessmentErrorMessage } from '../riskAssessmentForm';
import { initialWarningForm, parseWarningForm, validateWarningForm, warningFields, type WarningForm, type WarningFormErrors } from '../warningForm';
import { ReviewWarningScreen } from './ReviewWarningScreen';

export function CreateWarningScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const assessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const [form, setForm] = useState<WarningForm>(initialWarningForm);
  const [errors, setErrors] = useState<WarningFormErrors>({});
  const [review, setReview] = useState<CreateWarningRequest | null>(null);
  const [saved, setSaved] = useState<SafeWarning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('A saved assessment reference is required.');
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const resource = useAssessmentResource(load);
  useFocusEffect(useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setForm(initialWarningForm); setErrors({}); setReview(null); setSaved(null); setError(null); setBusy(false);
    return () => { generation.current += 1; };
  }, [accessToken, assessmentId]));

  const back = () => assessmentId
    ? router.replace({ pathname: '/officer/assessments/[assessmentId]', params: { assessmentId } })
    : router.replace('/officer/assessments');
  const update = (field: keyof WarningForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setError(null);
  };
  const startReview = () => {
    const validation = validateWarningForm(form);
    setErrors(validation);
    if (Object.keys(validation).length || !resource.data || resource.data.assessment.status !== 'ACTIVE'
      || !canCreateWarning(resource.data.assessment.finalRiskLevel)) return;
    setReview(parseWarningForm(resource.data.assessment.id, form));
    setError(null);
  };
  const save = async () => {
    if (inFlight.current || saved || !review || !accessToken || !resource.data
      || resource.data.assessment.status !== 'ACTIVE' || !canCreateWarning(resource.data.assessment.finalRiskLevel)) return;
    const current = generation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const uploaded = new Map<string, string>();
      const result = await saveWarningWithPhotos(review, photos.map((photo) => ({
        uri: photo.uri, base64: photo.base64 ?? '', mimeType: (photo.mimeType ?? 'image/jpeg') as 'image/jpeg'
      })), accessToken, uploaded, () => undefined);
      if (generation.current === current) setSaved(result.warning);
    } catch (failure) {
      if (generation.current === current) setError(assessmentErrorMessage(failure));
    } finally {
      if (generation.current === current) { inFlight.current = false; setBusy(false); }
    }
  };
  const choosePhotos = async () => {
    setPhotoError(null);
    if (photos.length >= 5) { setPhotoError('You can add up to 5 images.'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setPhotoError('Photo access is required to choose images.'); return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length, quality: 0.8, base64: true
    });
    if (result.canceled) return;
    const selected = result.assets.filter((asset) => asset.type === 'image' && asset.base64);
    if (selected.length !== result.assets.length) { setPhotoError('Choose supported image files only.'); return; }
    setPhotos((current) => [...current, ...selected].slice(0, 5));
  };
  const assessment = resource.data?.assessment;
  return <WarningPage key={saved ? 'saved' : review ? 'review' : 'form'}
    title={saved ? 'Warning Saved' : review ? 'Review Warning' : 'Create Early Warning'}
    reviewing={!!review} busy={busy} onBack={back}>
    {!assessment ? <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
      : assessment.status !== 'ACTIVE' ? <View style={assessmentStyles.card}>
        <Text accessibilityRole="alert" style={assessmentStyles.error}>Only ACTIVE assessments can be used to create a warning.</Text>
        <PriorityBadge priority={assessment.finalRiskLevel} />
      </View> : !canCreateWarning(assessment.finalRiskLevel) ? <View style={assessmentStyles.card}>
        <Text accessibilityRole="alert" style={assessmentStyles.error}>Only saved HIGH or CRITICAL assessments can be used to create a warning.</Text>
        <PriorityBadge priority={assessment.finalRiskLevel} />
      </View> : saved ? <View style={warningStyles.success}>
        <Text accessibilityRole="header" style={warningStyles.successTitle}>Warning draft created</Text>
        <Text style={assessmentStyles.body}>Your warning has been saved. It has not been published.</Text>
        <AssessmentDetail label="Warning Reference" value={saved.id} />
        <AssessmentDetail label="Status" value={saved.status} />
        <AssessmentButton label="Publish Warning" onPress={() => router.push({
          pathname: '/officer/warnings/[warningId]', params: { warningId: saved.id }
        })} />
        <AssessmentButton label="View Warning" secondary onPress={() => router.push({
          pathname: '/officer/warnings/[warningId]', params: { warningId: saved.id }
        })} />
        <AssessmentButton label="Return to Assessment" secondary onPress={back} />
      </View> : <>
        {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
        {review ? <ReviewWarningScreen warning={review} riskLevel={assessment.finalRiskLevel} busy={busy}
          photos={photos.map((photo) => ({ uri: photo.uri, base64: photo.base64 ?? '',
            mimeType: (photo.mimeType ?? 'image/jpeg') as 'image/jpeg' }))}
          onEdit={() => { setReview(null); setError(null); }} onSave={() => void save()} /> : <>
          <View style={assessmentStyles.card}>
            <Text style={assessmentStyles.heading}>Warning information</Text>
            <Text style={assessmentStyles.helper}>Fields marked * are required.</Text>
            <View style={warningStyles.risk}>
              <Text style={assessmentStyles.label}>Risk Level *</Text>
              <PriorityBadge priority={assessment.finalRiskLevel} />
              <Text style={assessmentStyles.helper}>From the saved assessment. This risk level cannot be changed here.</Text>
            </View>
            {warningFields.map((field) => <View key={field.key} style={warningStyles.field}>
              <Text style={assessmentStyles.label}>{field.label}{field.required ? ' *' : ''}</Text>
              <TextInput accessibilityLabel={`${field.label}${field.required ? ' (required)' : ''}`} value={form[field.key]}
                placeholder={field.placeholder} placeholderTextColor={dashboardTheme.colors.muted}
                multiline={field.key !== 'affectedArea'} maxLength={WARNING_FIELD_LIMITS[field.key]}
                onChangeText={(value) => update(field.key, value)}
                style={[assessmentStyles.input, field.key !== 'affectedArea' && warningStyles.multiline,
                  field.key === 'message' && warningStyles.message, !!errors[field.key] && warningStyles.invalidInput]} />
              {errors[field.key] ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{errors[field.key]}</Text> : null}
            </View>)}
          </View>
          <View style={assessmentStyles.card}>
            <Text style={assessmentStyles.heading}>Attachments (optional)</Text>
            <Text style={assessmentStyles.helper}>Add up to 5 images.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Add Photos" onPress={() => void choosePhotos()} style={styles.photoPicker}>
              <Text style={styles.camera}>📷</Text><Text style={styles.photoTitle}>Add Photos</Text>
              <Text style={assessmentStyles.helper}>Choose images from device</Text>
            </Pressable>
            {photos.length ? <View style={styles.thumbnails}>{photos.map((photo, index) => <View key={photo.uri} style={styles.thumbnailWrap}>
              <Image accessibilityLabel={`Selected image ${index + 1}`} source={{ uri: photo.uri }} style={styles.thumbnail} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove image ${index + 1}`} onPress={() => setPhotos((items) => items.filter((item) => item.uri !== photo.uri))} style={styles.remove}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>)}</View> : null}
            {photoError ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{photoError}</Text> : null}
          </View>
          {Object.keys(errors).length ? <Text accessibilityRole="alert" style={assessmentStyles.error}>Check the highlighted fields before reviewing your warning.</Text> : null}
          <AssessmentButton label="Review Warning" onPress={startReview} />
        </>}
      </>}
  </WarningPage>;
}

const styles = StyleSheet.create({
  photoPicker: { minHeight: 150, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#2563eb', borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18 },
  camera: { fontSize: 30 }, photoTitle: { color: '#1d4ed8', fontSize: 16, fontWeight: '700' },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, thumbnailWrap: { position: 'relative', paddingTop: 6, paddingRight: 6 },
  thumbnail: { width: 86, height: 86, borderRadius: 12 }, remove: { position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }, removeText: { color: '#fff', fontSize: 22 }
});
