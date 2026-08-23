import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { residentBottomNavItems } from '../mockData';
import {
  hazardTypeLabels,
  severityLabels,
  useReportHazardDraft
} from '../reportDraft';

const connectionStatus = 'Online';

export function ReviewReportScreen() {
  const router = useRouter();
  const { draft, validation } = useReportHazardDraft();
  const canSubmit = validation.isValid;

  const editReport = () => {
    router.push('/resident/report-hazard');
  };

  const submitReport = () => {
    if (!canSubmit) {
      return;
    }

    // Backend submission will be wired in the next task.
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
        <Text style={styles.headerTitle}>Review Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.introText}>Please check your report before submitting.</Text>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="warning-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Hazard</Text>
        </View>
        <View style={styles.detailGrid}>
          <ReviewDetail
            label="Hazard type"
            value={draft.hazardType ? hazardTypeLabels[draft.hazardType] : 'Not selected'}
          />
          <ReviewDetail
            label="Severity"
            value={draft.severity ? severityLabels[draft.severity] : 'Not selected'}
          />
        </View>
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}>
            <DashboardGlyph color={dashboardTheme.colors.primaryStrong} name="locate-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Location</Text>
        </View>
        {draft.location.status === 'DETECTED' ? (
          <View style={styles.locationPreview}>
            <Text style={styles.locationPreviewTitle}>Detected coordinates</Text>
            <Text style={styles.coordinateText}>
              Latitude {formatCoordinate(draft.location.latitude)}
            </Text>
            <Text style={styles.coordinateText}>
              Longitude {formatCoordinate(draft.location.longitude)}
            </Text>
            <Text style={styles.helperText}>Submission will convert this to [longitude, latitude].</Text>
          </View>
        ) : (
          <Text style={styles.errorText}>Location is required.</Text>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIconMuted}>
            <DashboardGlyph color={dashboardTheme.colors.info} name="camera-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Photo</Text>
        </View>
        {draft.photoEvidence.status === 'LOCAL_SELECTED' ? (
          <View style={styles.photoSummary}>
            <Image
              accessibilityLabel="Selected hazard evidence preview"
              source={{ uri: draft.photoEvidence.selected.localUri }}
              style={styles.photoPreview}
            />
            <Text style={styles.helperText}>
              Photo selected locally. It will need upload before final backend submission.
            </Text>
          </View>
        ) : (
          <View style={styles.emptyPhotoState}>
            <DashboardGlyph color={dashboardTheme.colors.muted} name="camera-outline" size={22} />
            <Text style={styles.helperText}>No photo was added.</Text>
          </View>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIconMuted}>
            <DashboardGlyph color={dashboardTheme.colors.info} name="document-text-outline" size={20} />
          </View>
          <Text style={styles.panelTitle}>Description</Text>
        </View>
        <Text style={styles.descriptionText}>{draft.description.trim() || 'No description entered.'}</Text>
      </View>

      <View style={styles.connectionPanel}>
        <View style={styles.connectionDot} />
        <View style={styles.connectionTextWrap}>
          <Text style={styles.connectionTitle}>Connection status</Text>
          <Text style={styles.helperText}>{connectionStatus}. Offline sync will be added later.</Text>
        </View>
      </View>

      {!canSubmit ? (
        <View style={styles.validationPanel}>
          {Object.values(validation.errors).map((message) => (
            <Text key={message} style={styles.errorText}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel="Edit hazard report"
          accessibilityRole="button"
          onPress={editReport}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <Text style={styles.editButtonText}>Edit Report</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Submit hazard report"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={submitReport}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.submitButtonDisabled,
            pressed && canSubmit && styles.pressed
          ]}
        >
          <Text style={[styles.submitButtonText, !canSubmit && styles.submitButtonTextDisabled]}>
            Submit Report
          </Text>
        </Pressable>
      </View>
    </DashboardScreen>
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

function formatCoordinate(value: number) {
  return value.toFixed(6);
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
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  introText: {
    fontSize: 16,
    lineHeight: 23,
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
  panelIconMuted: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  panelTitle: {
    flex: 1,
    fontSize: 18,
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
  photoSummary: {
    gap: 10
  },
  photoPreview: {
    width: '100%',
    minHeight: 188,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  emptyPhotoState: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  connectionPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: dashboardTheme.colors.success
  },
  connectionTextWrap: {
    flex: 1,
    gap: 2
  },
  connectionTitle: {
    fontSize: 15,
    fontWeight: '800',
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
