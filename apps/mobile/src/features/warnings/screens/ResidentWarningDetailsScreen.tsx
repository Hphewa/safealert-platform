import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../auth/hooks/useAuth';
import { acknowledgeResidentWarning, getResidentWarning } from '../api/residentWarningApi';
import type { ResidentWarning, WarningAcknowledgementResponse } from '@safealert/contracts';
import { cardShadow, dashboardTheme } from '../../dashboards/shared/theme';
import { DashboardGlyph } from '../../dashboards/shared/components/DashboardGlyph';

// ---------------------------------------------------------------------------
// Safety Guidance (LDFEW-116)
//
// The guidance sheet is presentation only. It renders the warning that this
// screen already loaded from the API, so opening it never triggers another
// request and never changes warning or acknowledgement behaviour.
// ---------------------------------------------------------------------------

type GuidanceTone = 'primary' | 'danger' | 'safe' | 'neutral';

const SAFETY_GUIDANCE_DISMISS_DISTANCE = 90;
const SAFETY_GUIDANCE_DISMISS_VELOCITY = 0.8;
const SAFETY_GUIDANCE_UNAVAILABLE = 'Safety guidance is currently unavailable for this warning.';
const SAFE_ROUTES_UNAVAILABLE = 'No recommended safe routes are currently available.';
const GUIDANCE_FIELD_UNAVAILABLE = 'Nothing was provided for this warning.';

function trimmed(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasSafetyGuidanceContent(warning: ResidentWarning) {
  return Boolean(
    trimmed(warning.requiredAction) ||
      trimmed(warning.unsafeRoads) ||
      trimmed(warning.safeRoutes) ||
      trimmed(warning.message)
  );
}

function guidanceToneStyles(tone: GuidanceTone): { block: ViewStyle; label: TextStyle; body: TextStyle } {
  switch (tone) {
    case 'primary':
      return {
        block: styles.guidanceBlockPrimary,
        label: styles.guidanceLabelPrimary,
        body: styles.guidanceBodyPrimary,
      };
    case 'danger':
      return {
        block: styles.guidanceBlockDanger,
        label: styles.guidanceLabelDanger,
        body: styles.guidanceBodyDanger,
      };
    case 'safe':
      return {
        block: styles.guidanceBlockSafe,
        label: styles.guidanceLabelSafe,
        body: styles.guidanceBodySafe,
      };
    default:
      return {
        block: styles.guidanceBlockNeutral,
        label: styles.guidanceLabelNeutral,
        body: styles.guidanceBodyNeutral,
      };
  }
}

function GuidanceField({
  icon,
  label,
  value,
  tone,
  emptyText = GUIDANCE_FIELD_UNAVAILABLE,
}: {
  icon: string;
  label: string;
  value: string | null | undefined;
  tone: GuidanceTone;
  emptyText?: string;
}) {
  const palette = guidanceToneStyles(tone);
  const resolved = trimmed(value);

  return (
    <View style={[styles.guidanceBlock, palette.block]}>
      <Text accessibilityRole="header" style={[styles.guidanceLabel, palette.label]}>
        {`${icon} ${label}`}
      </Text>
      {resolved ? (
        <Text style={[styles.guidanceBody, palette.body]}>{resolved}</Text>
      ) : (
        <Text style={styles.guidanceEmpty}>{emptyText}</Text>
      )}
    </View>
  );
}

function SafetyGuidanceEntryCard({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={styles.entryCard}>
      <Text style={styles.entryTitle}>⚠️ Safety Guidance</Text>
      <Text style={styles.entryDescription}>
        View important actions, roads to avoid, and recommended safe routes.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View Safety Guidance"
        onPress={onOpen}
        style={({ pressed }) => [styles.entryButton, pressed && styles.dimmed]}
      >
        <Text style={styles.entryButtonText}>View Safety Guidance</Text>
      </Pressable>
    </View>
  );
}

function SafetyGuidanceSheet({
  warning,
  visible,
  onClose,
}: {
  warning: ResidentWarning;
  visible: boolean;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the gesture only for a deliberate downward drag so the sheet
        // body keeps scrolling normally on small screens.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(gesture.dy, 0));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            gesture.dy > SAFETY_GUIDANCE_DISMISS_DISTANCE ||
            gesture.vy > SAFETY_GUIDANCE_DISMISS_VELOCITY
          ) {
            translateY.setValue(0);
            onCloseRef.current();
            return;
          }
          Animated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(translateY, { toValue: 0, duration: 150, useNativeDriver: false }).start();
        },
      }),
    [translateY]
  );

  const isCritical = warning.riskLevel === 'CRITICAL';
  const hasGuidance = hasSafetyGuidanceContent(warning);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.sheetOverlay}>
        <Pressable
          accessibilityLabel="Dismiss safety guidance"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.sheetBackdrop}
        />

        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          <View style={styles.sheetDragArea} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                Safety Guidance
              </Text>
              <Pressable
                accessibilityLabel="Close safety guidance"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.sheetCloseButton, pressed && styles.dimmed]}
              >
                <Text style={styles.sheetCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
            {hasGuidance ? (
              <>
                <GuidanceField
                  icon="❗"
                  label="Required Action"
                  tone="primary"
                  value={warning.requiredAction}
                />
                <GuidanceField
                  icon="🚧"
                  label="Roads to Avoid"
                  tone="danger"
                  value={warning.unsafeRoads}
                />
                <GuidanceField
                  icon="✅"
                  label="Recommended Safe Routes"
                  tone="safe"
                  value={warning.safeRoutes}
                  emptyText={SAFE_ROUTES_UNAVAILABLE}
                />
                <GuidanceField
                  icon="📢"
                  label="Warning Message"
                  tone="neutral"
                  value={warning.message}
                />
              </>
            ) : (
              <View style={styles.unavailableCard}>
                <Text style={styles.unavailableText}>{SAFETY_GUIDANCE_UNAVAILABLE}</Text>
              </View>
            )}

            <View style={styles.riskSection}>
              <Text accessibilityRole="header" style={styles.sectionHeading}>
                Risk / Affected Area
              </Text>
              <Text
                accessibilityRole="text"
                accessibilityLabel={`${warning.riskLevel} risk level`}
                style={[styles.riskBadge, isCritical ? styles.riskCritical : styles.riskHigh]}
              >
                {`${warning.riskLevel} WARNING`}
              </Text>
              <Text style={styles.riskArea}>{warning.affectedArea}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ResidentWarningDetailsScreen() {
  const params = useLocalSearchParams<{ warningId?: string | string[] }>();
  const warningId = Array.isArray(params.warningId) ? params.warningId[0] : params.warningId;
  const { accessToken } = useAuth();
  const router = useRouter();

  const [warning, setWarning] = useState<ResidentWarning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<WarningAcknowledgementResponse | null>(null);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setWarning(null);
      setError(null);
      setResponse(null);

      if (!accessToken || !warningId) {
        setError('This warning is unavailable.');
        return () => { active = false; };
      }

      void getResidentWarning(warningId, accessToken)
        .then((result) => { if (active) setWarning(result.warning); })
        .catch(() => { if (active) setError('This warning is unavailable.'); });

      return () => { active = false; };
    }, [accessToken, warningId])
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/resident/warnings');
  };

  const acknowledge = async () => {
    if (!accessToken || !warning || !response || saving) return;
    setSaving(true);
    try {
      const result = await acknowledgeResidentWarning(warning.id, { response }, accessToken);
      setWarning({ ...warning, acknowledgedAt: result.acknowledgedAt });
    } catch {
      setError('Unable to acknowledge this warning.');
    } finally {
      setSaving(false);
    }
  };

  if (!warning && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={dashboardTheme.colors.primary} />
      </View>
    );
  }

  if (error || !warning) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Warning unavailable.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack}>
          <Text style={styles.back}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const attachments = warning.attachments ?? [];
  const options: Array<[WarningAcknowledgementResponse, string]> = [
    ['SAFE', 'I am Safe'],
    ['EVACUATING', 'I am Evacuating'],
    ['NEED_ASSISTANCE', 'I Need Assistance'],
  ];

  const isCritical = warning.riskLevel === 'CRITICAL';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={goBack}
        style={({ pressed }) => [styles.backIcon, pressed && styles.dimmed]}
      >
        <DashboardGlyph name="arrow-back" color={dashboardTheme.colors.primaryStrong} size={22} />
        <Text style={styles.backIconLabel}>Warning Details</Text>
      </Pressable>
      {/* ── Risk level badge ── */}
      <Text
        style={[styles.riskBadge, isCritical ? styles.riskCritical : styles.riskHigh]}
        accessibilityRole="text"
        accessibilityLabel={`${warning.riskLevel} risk level`}
      >
        {`${warning.riskLevel} WARNING`}
      </Text>

      {/* ── Affected area ── */}
      <Text style={styles.areaTitle}>{warning.affectedArea}</Text>

      {/* ── Warning message (kept visible on the warning screen) ── */}
      {trimmed(warning.message) ? (
        <View style={styles.inlineCard}>
          <Text style={styles.fieldLabel}>Warning Message</Text>
          <Text style={styles.inlineBody}>{warning.message}</Text>
        </View>
      ) : null}

      {/* ── Required action (most prominent inline block) ── */}
      {trimmed(warning.requiredAction) ? (
        <View style={[styles.inlineCard, styles.requiredActionCard]}>
          <Text style={styles.requiredActionLabel}>Required Action</Text>
          <Text style={styles.requiredActionBody}>{warning.requiredAction}</Text>
        </View>
      ) : null}

      {/* ── Safety Guidance entry point (LDFEW-116) ── */}
      <SafetyGuidanceEntryCard onOpen={() => setIsGuidanceOpen(true)} />

      {/* ── Attachments ── */}
      {attachments.length > 0 ? (
        <View style={styles.attachmentsCard}>
          <Text style={styles.fieldLabel}>Attachments</Text>
          {attachments.map((a) => (
            <Text key={a} style={styles.attachmentItem}>
              {a}
            </Text>
          ))}
        </View>
      ) : null}

      {/* ── Acknowledgement status ── */}
      <Text style={styles.ackStatus}>
        {warning.acknowledgedAt
          ? `✓ Acknowledged ${new Date(warning.acknowledgedAt).toLocaleString()}`
          : 'Not yet acknowledged'}
      </Text>

      {/* ── Acknowledgement response card (LDFEW-114 — unchanged functionally) ── */}
      {!warning.acknowledgedAt ? (
        <View style={styles.responseCard}>
          <Text style={styles.fieldLabel}>How are you responding?</Text>
          {options.map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: response === value }}
              onPress={() => setResponse(value)}
              style={[styles.responseOption, response === value && styles.responseSelected]}
            >
              <Text style={styles.responseText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={saving || !response}
            onPress={() => void acknowledge()}
            style={[styles.submitButton, (!response || saving) && styles.submitButtonDisabled]}
          >
            <Text style={styles.submitButtonText}>{saving ? 'Saving…' : 'Submit response'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={goBack}
        style={styles.backPressable}
      >
        <Text style={styles.back}>Back to active warnings</Text>
      </Pressable>

      {/* ── Safety Guidance bottom sheet (LDFEW-116) ── */}
      <SafetyGuidanceSheet
        warning={warning}
        visible={isGuidanceOpen}
        onClose={() => setIsGuidanceOpen(false)}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 14,
    backgroundColor: dashboardTheme.colors.background,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  // ── Risk badge ──
  riskBadge: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    overflow: 'hidden',
  },
  riskHigh: {
    backgroundColor: '#d97706',
  },
  riskCritical: {
    backgroundColor: dashboardTheme.colors.critical,
  },

  // ── Area title ──
  areaTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: dashboardTheme.colors.text,
    marginTop: -2,
  },

  // ── Inline warning information cards ──
  inlineCard: {
    gap: 6,
    padding: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    ...cardShadow,
  },
  inlineBody: {
    fontSize: 15,
    lineHeight: 23,
    color: dashboardTheme.colors.text,
  },
  requiredActionCard: {
    gap: 8,
    backgroundColor: dashboardTheme.colors.primarySoft,
    borderColor: dashboardTheme.colors.primary,
    borderLeftWidth: 4,
  },
  requiredActionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: dashboardTheme.colors.primaryStrong,
  },
  requiredActionBody: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: dashboardTheme.colors.text,
  },

  // ── Safety Guidance entry point ──
  entryCard: {
    gap: 10,
    padding: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    ...cardShadow,
  },
  entryTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: dashboardTheme.colors.text,
  },
  entryDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: dashboardTheme.colors.muted,
  },
  entryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary,
  },
  entryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  dimmed: {
    opacity: 0.7,
  },

  // ── Safety Guidance bottom sheet ──
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: dashboardTheme.radius.lg,
    borderTopRightRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.surface,
    paddingBottom: 6,
  },
  sheetDragArea: {
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: dashboardTheme.colors.border,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  sheetTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '900',
    color: dashboardTheme.colors.text,
  },
  sheetCloseButton: {
    minHeight: 44,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primarySoft,
  },
  sheetCloseText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong,
  },
  sheetScroll: {
    flexShrink: 1,
    borderTopWidth: 1,
    borderTopColor: dashboardTheme.colors.border,
  },
  sheetContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 32,
  },

  // ── Section heading ──
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong,
    letterSpacing: 0.3,
  },

  // ── Individual guidance block ──
  guidanceBlock: {
    gap: 6,
    padding: 14,
    borderRadius: 12,
  },
  guidanceBlockNeutral: {
    backgroundColor: dashboardTheme.colors.surfaceMuted,
  },
  guidanceBlockPrimary: {
    backgroundColor: dashboardTheme.colors.primarySoft,
    borderLeftWidth: 4,
    borderLeftColor: dashboardTheme.colors.primary,
  },
  guidanceBlockDanger: {
    backgroundColor: dashboardTheme.colors.criticalSoft,
    borderLeftWidth: 4,
    borderLeftColor: dashboardTheme.colors.critical,
  },
  guidanceBlockSafe: {
    backgroundColor: dashboardTheme.colors.successSoft,
    borderLeftWidth: 4,
    borderLeftColor: dashboardTheme.colors.success,
  },

  // ── Guidance labels ──
  guidanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  guidanceLabelNeutral: {
    color: dashboardTheme.colors.muted,
  },
  guidanceLabelPrimary: {
    color: dashboardTheme.colors.primaryStrong,
  },
  guidanceLabelDanger: {
    color: dashboardTheme.colors.critical,
  },
  guidanceLabelSafe: {
    color: dashboardTheme.colors.success,
  },

  // ── Guidance body text ──
  guidanceBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  guidanceBodyNeutral: {
    color: dashboardTheme.colors.text,
  },
  guidanceBodyPrimary: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: dashboardTheme.colors.text,
  },
  guidanceBodyDanger: {
    color: '#7f1d1d',
  },
  guidanceBodySafe: {
    color: '#14532d',
  },

  // ── Empty / unavailable guidance text ──
  guidanceEmpty: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted,
    fontStyle: 'italic',
  },
  unavailableCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
  },
  unavailableText: {
    fontSize: 15,
    lineHeight: 21,
    color: dashboardTheme.colors.text,
  },

  // ── Risk / affected area recap inside the sheet ──
  riskSection: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: dashboardTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
  },
  riskArea: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: dashboardTheme.colors.text,
  },

  // ── Generic field label ──
  fieldLabel: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: dashboardTheme.colors.muted,
  },

  // ── Attachments ──
  attachmentsCard: {
    gap: 6,
    padding: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
  },
  attachmentItem: {
    color: dashboardTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Acknowledgement status ──
  ackStatus: {
    color: dashboardTheme.colors.primaryStrong,
    fontWeight: '800',
    fontSize: 14,
  },

  // ── Acknowledgement response card ──
  responseCard: {
    gap: 9,
    padding: 14,
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.surface,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
  },
  responseOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
  },
  responseSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft,
  },
  responseText: {
    color: dashboardTheme.colors.text,
    fontWeight: '700',
  },
  submitButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: dashboardTheme.colors.primary,
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  // ── Back link ──
  backPressable: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  backIcon: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  backIconText: {
    fontSize: 28,
    lineHeight: 32,
    color: dashboardTheme.colors.primaryStrong,
  },
  backIconLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text,
  },
  back: {
    color: dashboardTheme.colors.primaryStrong,
    fontWeight: '800',
    textAlign: 'center',
  },

  // ── Error state ──
  errorText: {
    color: dashboardTheme.colors.critical,
    textAlign: 'center',
  },
});
