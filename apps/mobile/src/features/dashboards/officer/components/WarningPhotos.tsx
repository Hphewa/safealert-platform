import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { WARNING_FIELD_LIMITS } from '@safealert/contracts';
import type { WarningPhoto } from '../warningImages';
import { assessmentStyles } from './RiskAssessmentComponents';
import { dashboardTheme } from '../../shared/theme';

export function WarningPhotoPreviews({ photos, onRemove, disabled = false }: {
  photos: WarningPhoto[]; onRemove?: (uri: string) => void; disabled?: boolean;
}) {
  return <View style={styles.previews}>{photos.map((photo, index) => <View key={photo.uri} style={styles.preview}>
    <Image accessibilityLabel={`Selected image ${index + 1}`} source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" />
    {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove image ${index + 1}`}
      disabled={disabled} accessibilityState={{ disabled }} onPress={() => onRemove(photo.uri)} style={styles.remove}>
      <Text style={styles.removeText}>×</Text>
    </Pressable> : null}
  </View>)}</View>;
}

export function WarningPhotos({ photos, choosing, error, onChoose, onRemove }: {
  photos: WarningPhoto[]; choosing: boolean; error?: string | undefined;
  onChoose: () => void; onRemove: (uri: string) => void;
}) {
  const disabled = choosing || photos.length >= WARNING_FIELD_LIMITS.attachments;
  return <View style={assessmentStyles.card}>
    <Text style={assessmentStyles.heading}>Attachments (optional)</Text>
    <Text style={assessmentStyles.helper}>Add up to 5 images.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Add Photos" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onChoose} style={({ pressed }) => [styles.choose, (disabled || pressed) && styles.dimmed]}>
      <Text style={styles.camera}>📷</Text>
      <Text style={styles.chooseTitle}>{choosing ? 'Opening Photos…' : 'Add Photos'}</Text>
      <Text style={assessmentStyles.helper}>Choose images from device</Text>
    </Pressable>
    {photos.length ? <>
      <Text style={assessmentStyles.label}>Selected ({photos.length}/5)</Text>
      <WarningPhotoPreviews photos={photos} onRemove={onRemove} disabled={choosing} />
    </> : null}
    {error ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  choose: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: dashboardTheme.colors.primary,
    borderRadius: dashboardTheme.radius.sm, backgroundColor: dashboardTheme.colors.primarySoft,
    minHeight: 150, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 6 },
  dimmed: { opacity: 0.55 },
  camera: { fontSize: 30 },
  chooseTitle: { color: dashboardTheme.colors.primaryStrong, fontSize: 16, fontWeight: '700' },
  previews: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  preview: { width: 92, paddingTop: 6, paddingRight: 6 },
  image: { width: 86, height: 86, borderRadius: 12, backgroundColor: dashboardTheme.colors.surfaceMuted },
  remove: { position: 'absolute', top: 0, right: 0, minWidth: 44, minHeight: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.text },
  removeText: { color: dashboardTheme.colors.surface, fontSize: 25, fontWeight: '600' }
});
