import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { canCreateWarning, type CreateWarningRequest, type SafeWarning } from '@safealert/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getRiskAssessment } from '../api/riskAssessmentApi';
import { saveWarningWithPhotos } from '../api/warningApi';
import { useAssessmentResource } from '../hooks/useAssessmentResource';
import { AssessmentButton, AssessmentDetail, AssessmentLoadState, assessmentStyles } from '../components/RiskAssessmentComponents';
import { WarningPage, warningStyles } from '../components/WarningComponents';
import { WarningInformationForm } from '../components/WarningInformationForm';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { assessmentErrorMessage } from '../riskAssessmentForm';
import { getWarningAffectedArea, initialWarningForm, parseWarningForm, validateWarningForm, type WarningForm, type WarningFormErrors } from '../warningForm';
import { addWarningPhotos, type WarningPhoto } from '../warningImages';
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
  const [photos, setPhotos] = useState<WarningPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!assessmentId) throw new Error('A saved assessment reference is required.');
    return getRiskAssessment(assessmentId, accessToken);
  }, [accessToken, assessmentId]);
  const resource = useAssessmentResource(load);
  const affectedArea = getWarningAffectedArea(resource.data);
  useFocusEffect(useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    setForm(initialWarningForm); setErrors({}); setReview(null); setSaved(null); setError(null); setBusy(false);
    setPhotos([]); setPhotoError(null);
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
    if (!affectedArea) {
      setError('The source report location is unavailable. Reload the assessment before creating a warning.');
      return;
    }
    const populatedForm = { ...form, affectedArea };
    const validation = validateWarningForm(populatedForm);
    setErrors(validation);
    if (Object.keys(validation).length || !resource.data || !canCreateWarning(resource.data.assessment.finalRiskLevel)) return;
    setReview(parseWarningForm(resource.data.assessment.id, populatedForm));
    setError(null);
  };
  const save = async () => {
    if (inFlight.current || saved || !review || !accessToken || !resource.data || !canCreateWarning(resource.data.assessment.finalRiskLevel)) return;
    const current = generation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const uploaded = new Map<string, string>();
      const result = await saveWarningWithPhotos(review, photos, accessToken, uploaded, () => undefined,
        () => generation.current === current);
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
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setPhotoError('Photo access is required to choose images.'); return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true,
        selectionLimit: 5 - photos.length, quality: 0.8, base64: true
      });
      if (!result.canceled) setPhotos(addWarningPhotos(photos, result.assets));
    } catch (failure) { setPhotoError(assessmentErrorMessage(failure)); }
  };
  const assessment = resource.data?.assessment;
  return <WarningPage key={saved ? 'saved' : review ? 'review' : 'form'}
    title={saved ? 'Warning Saved' : review ? 'Review Warning' : 'Create Early Warning'}
    reviewing={!!review} busy={busy} onBack={back} contentContainerStyle={styles.content}>
    {!assessment ? <AssessmentLoadState loading={resource.loading} error={resource.error} retry={() => void resource.reload()} />
      : !canCreateWarning(assessment.finalRiskLevel) ? <View style={assessmentStyles.card}>
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
        {review ? <ReviewWarningScreen warning={review} riskLevel={assessment.finalRiskLevel} busy={busy} photos={photos}
          onEdit={() => { setReview(null); setError(null); }} onSave={() => void save()} /> : <>
          <WarningInformationForm form={form} affectedArea={affectedArea} riskLevel={assessment.finalRiskLevel}
            errors={errors} onChange={update} />
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
          <AssessmentButton label="Review Warning" disabled={!affectedArea} onPress={startReview} />
        </>}
      </>}
  </WarningPage>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingTop: 16, paddingBottom: 32 },
  photoPicker: { minHeight: 150, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#2563eb', borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18 },
  camera: { fontSize: 30 }, photoTitle: { color: '#1d4ed8', fontSize: 16, fontWeight: '700' },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, thumbnailWrap: { position: 'relative', paddingTop: 6, paddingRight: 6 },
  thumbnail: { width: 86, height: 86, borderRadius: 12 }, remove: { position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }, removeText: { color: '#fff', fontSize: 22 }
});
